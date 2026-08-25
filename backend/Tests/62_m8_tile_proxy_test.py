"""M8 phase 2 (D10) — GET /api/v1/tiles/<layer>/<z>/<x>/<y>.png tile proxy."""
from datetime import datetime, timedelta, timezone

from opentelemetry.instrumentation.utils import is_instrumentation_enabled

import Services.tile_service as tile_service
from Services.tile_service import TileService


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
    fresh = datetime.now(timezone.utc) - timedelta(days=1)
    monkeypatch.setattr(
        tile_service.StorageService, "get_object_with_age", lambda key: (b"cached-bytes", fresh)
    )

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("upstream should not be called on a fresh cache hit")

    monkeypatch.setattr(tile_service.requests, "get", _fail_if_called)

    data, content_type = TileService.get_tile("osm", 3, 4, 2)
    assert data == b"cached-bytes"
    assert content_type == "image/png"


def test_cache_miss_fetches_and_stores(monkeypatch):
    monkeypatch.setattr(tile_service.StorageService, "get_object_with_age", lambda key: None)
    stored = {}
    monkeypatch.setattr(
        tile_service.StorageService,
        "put_object",
        lambda key, data, content_type: stored.update(key=key, data=data, content_type=content_type),
    )
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"fresh-bytes")
    )

    data, content_type = TileService.get_tile("osm", 3, 4, 2)

    assert data == b"fresh-bytes"
    assert content_type == "image/png"
    assert stored == {"key": "tiles/osm/3/4/2.png", "data": b"fresh-bytes", "content_type": "image/png"}


def test_stale_cache_is_refreshed_from_upstream(monkeypatch):
    stale = datetime.now(timezone.utc) - timedelta(days=8)
    monkeypatch.setattr(
        tile_service.StorageService, "get_object_with_age", lambda key: (b"old-bytes", stale)
    )
    monkeypatch.setattr(tile_service.StorageService, "put_object", lambda key, data, content_type: None)
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"new-bytes")
    )

    data, _ = TileService.get_tile("seamark", 3, 4, 2)
    assert data == b"new-bytes"


def test_upstream_failure_with_no_cache_raises_upstream_unavailable(monkeypatch):
    monkeypatch.setattr(tile_service.StorageService, "get_object_with_age", lambda key: None)
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"", status=502)
    )

    try:
        TileService.get_tile("osm", 3, 4, 2)
        assert False, "expected ValueError"
    except ValueError as e:
        assert str(e) == "upstream_unavailable"


def test_upstream_failure_with_stale_cache_serves_stale(monkeypatch):
    stale = datetime.now(timezone.utc) - timedelta(days=8)
    monkeypatch.setattr(
        tile_service.StorageService, "get_object_with_age", lambda key: (b"stale-bytes", stale)
    )
    monkeypatch.setattr(
        tile_service.requests, "get", lambda url, headers, timeout: _FakeResponse(b"", status=502)
    )

    data, content_type = TileService.get_tile("osm", 3, 4, 2)
    assert data == b"stale-bytes"
    assert content_type == "image/png"


def test_get_tile_route_no_auth_required(client, monkeypatch):
    monkeypatch.setattr(tile_service.StorageService, "get_object_with_age", lambda key: None)
    monkeypatch.setattr(tile_service.StorageService, "put_object", lambda key, data, content_type: None)
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
    monkeypatch.setattr(tile_service.StorageService, "get_object_with_age", lambda key: None)
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
    monkeypatch.setattr(tile_service.StorageService, "get_object_with_age", lambda key: None)
    monkeypatch.setattr(
        tile_service.StorageService, "put_object", lambda key, data, content_type: None
    )
    traced_at_fetch = []

    def record_instrumentation_state(url, headers, timeout):
        traced_at_fetch.append(is_instrumentation_enabled())
        return _FakeResponse(b"fresh-bytes")

    monkeypatch.setattr(tile_service.requests, "get", record_instrumentation_state)

    TileService.get_tile("osm", 3, 4, 2)

    assert traced_at_fetch == [False]
