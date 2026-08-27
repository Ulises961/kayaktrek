"""M8 phase 2 (D10) — GET /api/v1/tiles/<layer>/<z>/<x>/<y>.png tile proxy."""
import os
from datetime import datetime, timedelta, timezone

import pytest
from opentelemetry.instrumentation.utils import is_instrumentation_enabled

import Services.tile_cache as tile_cache
import Services.tile_service as tile_service
from Services.tile_service import TileService


@pytest.fixture(autouse=True)
def isolated_tile_cache(tmp_path, monkeypatch):
    """Point the real on-disk cache at a temp dir for every test in this file.

    These tests used to monkeypatch StorageService.get_object_with_age/put_object, which
    could only ever confirm what the author already believed about the cache. The cache is
    now a directory, so driving the real one costs nothing and covers the parts a stub
    cannot: the write-then-rename, the mtime that freshness reads, and eviction ordering.
    """
    monkeypatch.setattr(tile_cache, "_CACHE_DIR", tmp_path / "tiles")


def _cache_tile(layer, z, x, y, data, age=None):
    """Write a tile directly into the cache, optionally backdated to a given age."""
    tile_cache.put(layer, z, x, y, data)
    if age is not None:
        path = tile_cache._tile_path(layer, z, x, y)
        stamp = (datetime.now(timezone.utc) - age).timestamp()
        os.utime(path, (stamp, stamp))


class _FakeResponse:
    def __init__(self, content: bytes, status: int = 200):
        self.content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests

            raise requests.HTTPError(f"status {self.status_code}")


def test_invalid_layer_raises(monkeypatch):
    try:
        TileService.get_tile("bing", 3, 4, 2)
        assert False, "expected ValueError"
    except ValueError as e:
        assert str(e) == "invalid_layer"


def test_out_of_range_coords_raise(monkeypatch):
    for z, x, y in [(-1, 0, 0), (20, 0, 0), (3, 8, 0), (3, 0, 8), (3, -1, 0)]:
        try:
            TileService.get_tile("osm", z, x, y)
            assert False, f"expected ValueError for {z, x, y}"
        except ValueError as e:
            assert str(e) == "invalid_coords"


def test_cache_hit_skips_upstream(monkeypatch):
    _cache_tile("osm", 3, 4, 2, b"cached-bytes", age=timedelta(days=1))

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("upstream should not be called on a fresh cache hit")

    monkeypatch.setattr(tile_service.requests, "get", _fail_if_called)

    data, content_type = TileService.get_tile("osm", 3, 4, 2)
    assert data == b"cached-bytes"
    assert content_type == "image/png"


def test_cache_miss_fetches_and_stores(monkeypatch):
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"fresh-bytes")
    )

    data, content_type = TileService.get_tile("osm", 3, 4, 2)

    assert data == b"fresh-bytes"
    assert content_type == "image/png"
    # Written where a later request will find it, and nowhere else.
    assert tile_cache._tile_path("osm", 3, 4, 2).read_bytes() == b"fresh-bytes"
    assert tile_cache.get("osm", 3, 4, 2)[0] == b"fresh-bytes"
    assert list(tile_cache._CACHE_DIR.rglob("*.tmp")) == [], "temp file left behind"


def test_stale_cache_is_refreshed_from_upstream(monkeypatch):
    _cache_tile("seamark", 3, 4, 2, b"old-bytes", age=timedelta(days=8))
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"new-bytes")
    )

    data, _ = TileService.get_tile("seamark", 3, 4, 2)
    assert data == b"new-bytes"
    # The refetch must also rewrite the cache — that reset mtime is what makes mtime usable
    # as an approximate LRU signal for eviction.
    assert tile_cache.get("seamark", 3, 4, 2)[0] == b"new-bytes"


def test_upstream_failure_with_no_cache_raises_upstream_unavailable(monkeypatch):
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"", status=502)
    )

    try:
        TileService.get_tile("osm", 3, 4, 2)
        assert False, "expected ValueError"
    except ValueError as e:
        assert str(e) == "upstream_unavailable"


def test_upstream_failure_with_stale_cache_serves_stale(monkeypatch):
    _cache_tile("osm", 3, 4, 2, b"stale-bytes", age=timedelta(days=8))
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"", status=502)
    )

    data, content_type = TileService.get_tile("osm", 3, 4, 2)
    assert data == b"stale-bytes"
    assert content_type == "image/png"


def test_get_tile_route_no_auth_required(client, monkeypatch):
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"png-bytes")
    )

    r = client.get("/api/v1/tiles/osm/3/4/2.png")

    assert r.status_code == 200
    assert r.mimetype == "image/png"
    assert r.headers["Cache-Control"] == "public, max-age=86400"
    assert r.data == b"png-bytes"


def test_get_tile_route_invalid_layer_is_404(client):
    r = client.get("/api/v1/tiles/bing/3/4/2.png")
    assert r.status_code == 404


def test_get_tile_route_upstream_failure_is_502(client, monkeypatch):
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"", status=502)
    )

    r = client.get("/api/v1/tiles/osm/3/4/2.png")

    assert r.status_code == 502


def test_upstream_fetch_is_not_traced(monkeypatch):
    """A single map view bursts 30-60 tile requests, which is why `/api/v1/tiles/*` is
    in Api/observability.py's exclusion list. That list only drops the Flask span, so
    the upstream fetch — auto-instrumented by `logfire.instrument_requests()` — went on
    being recorded, and with its parent excluded it arrived unparented. Nothing is lost
    by suppressing it: a cache miss is uninteresting, and a *failed* fetch is reported
    by `tile_upstream_failed`, a log line rather than a span.

    Asserted through `is_instrumentation_enabled()`, the gate the requests instrumentor
    itself checks, since monkeypatching `requests.get` replaces the very function the
    instrumentation wraps — a span-counting test here would pass without the fix.
    """
    traced_at_fetch = []

    def record_instrumentation_state(url, headers, timeout):
        traced_at_fetch.append(is_instrumentation_enabled())
        return _FakeResponse(b"fresh-bytes")

    monkeypatch.setattr(tile_service.requests, "get", record_instrumentation_state)

    TileService.get_tile("osm", 3, 4, 2)

    assert traced_at_fetch == [False]
