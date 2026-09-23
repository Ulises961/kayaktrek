"""Services/tile_cache.py — the on-disk tile cache and its eviction sweep."""
import errno
import os
from datetime import datetime, timedelta, timezone

import pytest

import Services.tile_cache as tile_cache


@pytest.fixture(autouse=True)
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(tile_cache, "_CACHE_DIR", tmp_path / "tiles")
    return tmp_path / "tiles"


def _write(layer, z, x, y, data=b"\x89PNG-bytes", age=None, used=None):
    """Cache a tile, optionally backdating when it was fetched (`age`, the mtime) and when
    it was last served (`used`, the atime — defaults to the fetch time)."""
    tile_cache.put(layer, z, x, y, data)
    path = tile_cache._tile_path(layer, z, x, y)
    if age is not None or used is not None:
        now = datetime.now(timezone.utc)
        fetched = (now - (age or timedelta(0))).timestamp()
        last_used = (now - used).timestamp() if used is not None else fetched
        os.utime(path, (last_used, fetched))
    return path


def test_round_trip_returns_bytes_and_mtime(cache_dir):
    _write("osm", 3, 4, 2, b"tile-bytes")

    cached = tile_cache.get("osm", 3, 4, 2)

    assert cached is not None
    data, modified = cached
    assert data == b"tile-bytes"
    # Freshness is read off mtime, so it has to come back as an aware UTC datetime — a naive
    # one would silently compare wrong against datetime.now(timezone.utc) in TileService.
    assert modified.tzinfo is not None
    assert abs((datetime.now(timezone.utc) - modified).total_seconds()) < 5


def test_miss_returns_none(cache_dir):
    assert tile_cache.get("osm", 3, 4, 2) is None


def test_layers_and_coordinates_do_not_collide(cache_dir):
    _write("osm", 3, 4, 2, b"osm-tile")
    _write("seamark", 3, 4, 2, b"seamark-tile")
    _write("osm", 3, 4, 3, b"neighbour")

    assert tile_cache.get("osm", 3, 4, 2)[0] == b"osm-tile"
    assert tile_cache.get("seamark", 3, 4, 2)[0] == b"seamark-tile"
    assert tile_cache.get("osm", 3, 4, 3)[0] == b"neighbour"


def test_write_is_atomic_and_leaves_no_temp_file(cache_dir, monkeypatch):
    """A failed write must publish nothing rather than a truncated tile.

    Two requests for the same missing tile fetch and write concurrently, so a reader can
    land mid-write. A short file is worse than a miss: it is a broken image the cache then
    serves happily until the freshness window expires.
    """
    real_write = tile_cache.Path.write_bytes

    def _explode(self, data):
        real_write(self, data[: len(data) // 2])
        raise OSError(errno.EIO, "device died")

    monkeypatch.setattr(tile_cache.Path, "write_bytes", _explode)
    tile_cache.put("osm", 3, 4, 2, b"would-be-truncated")

    assert tile_cache.get("osm", 3, 4, 2) is None, "a partial write must not be published"
    assert list(cache_dir.rglob("*.tmp")) == [], "temp file left behind"


def test_write_failure_never_raises(cache_dir, monkeypatch):
    """A cache that cannot write must not fail the request — the tile is already in hand."""
    def _no_space(self, data):
        raise OSError(errno.ENOSPC, "no space left on device")

    monkeypatch.setattr(tile_cache.Path, "write_bytes", _no_space)

    tile_cache.put("osm", 3, 4, 2, b"bytes")  # must not raise

    assert tile_cache.get("osm", 3, 4, 2) is None


def test_rejects_a_layer_that_would_escape_the_cache_directory(cache_dir):
    for hostile in ("../../etc", "osm/../..", ".."):
        with pytest.raises(ValueError):
            tile_cache.get(hostile, 3, 4, 2)


def test_sweep_is_a_noop_when_under_both_thresholds(cache_dir):
    _write("osm", 3, 4, 2)
    _write("osm", 3, 4, 3)

    summary = tile_cache.sweep(max_bytes=10 * 1024**3, min_free_bytes=0)

    assert summary["evicted"] == 0
    assert summary["tiles"] == 2
    assert tile_cache.get("osm", 3, 4, 2) is not None


def test_a_hit_marks_the_tile_used_without_changing_when_it_was_fetched(cache_dir):
    """Least-recently-used eviction needs a last-used time, and freshness needs the fetch
    time. They are kept apart: atime for use, mtime for the fetch."""
    path = _write("osm", 1, 0, 0, age=timedelta(days=60))
    fetched_before = path.stat().st_mtime

    tile_cache.get("osm", 1, 0, 0)

    stat = path.stat()
    assert stat.st_mtime == fetched_before, "a hit must not make a stale tile look fresh"
    assert datetime.now(timezone.utc).timestamp() - stat.st_atime < 60


def test_a_hit_within_a_day_of_the_last_one_writes_nothing(cache_dir, monkeypatch):
    """A map view bursts dozens of tiles, and a busy tile is served many times a day. One
    metadata write a day per tile is enough resolution for eviction.

    Asserted on the utime call rather than the resulting atime: under `relatime` the kernel
    may itself bump atime on the read, which is not this code's doing."""
    _write("osm", 1, 0, 0, age=timedelta(days=60), used=timedelta(hours=1))
    writes = []
    monkeypatch.setattr(tile_cache.os, "utime", lambda *args, **kwargs: writes.append(args))

    tile_cache.get("osm", 1, 0, 0)

    assert writes == []


def test_sweep_evicts_least_recently_used_first(cache_dir):
    """A tile fetched long ago but still requested outlives one fetched recently and never
    asked for again — with a months-long freshness window, fetch time says nothing about
    whether anyone still wants a tile."""
    payload = b"x" * 1000
    _write("osm", 1, 0, 0, payload, age=timedelta(days=80), used=timedelta(hours=1))
    _write("osm", 1, 0, 1, payload, age=timedelta(days=40), used=timedelta(days=30))

    # Cap of 1500 bytes: the low-water mark takes the target to 1350, so one must go.
    summary = tile_cache.sweep(max_bytes=1500, min_free_bytes=0)

    assert summary["evicted"] == 1
    assert tile_cache.get("osm", 1, 0, 0) is not None, "the tile still in use must survive"
    assert tile_cache.get("osm", 1, 0, 1) is None


def test_sweep_evicts_oldest_first_until_under_the_cap(cache_dir):
    """Eviction order is what makes the cache useful rather than merely bounded."""
    payload = b"x" * 1000
    _write("osm", 1, 0, 0, payload, age=timedelta(days=90))   # coldest
    _write("osm", 1, 0, 1, payload, age=timedelta(days=60))
    _write("osm", 1, 0, 2, payload, age=timedelta(days=30))
    _write("osm", 1, 0, 3, payload, age=timedelta(days=1))    # hottest

    # Cap of 2500 bytes: the low-water mark takes the target to 2250, so two must go.
    summary = tile_cache.sweep(max_bytes=2500, min_free_bytes=0)

    assert summary["evicted"] == 2
    assert tile_cache.get("osm", 1, 0, 0) is None, "coldest should have gone first"
    assert tile_cache.get("osm", 1, 0, 1) is None
    assert tile_cache.get("osm", 1, 0, 2) is not None, "warmer tiles must survive"
    assert tile_cache.get("osm", 1, 0, 3) is not None


def test_sweep_evicts_below_the_cap_when_the_disk_is_short_on_space(cache_dir, monkeypatch):
    """The free-space floor is the only rule that responds to something other than tiles.

    Docker layers, log growth and a staged pg_dump all consume the same filesystem, and on a
    one-box deployment a full disk stops Postgres writing WAL. So a sweep must be able to
    free space it did not itself consume, while the cache is comfortably under its own cap.
    """
    payload = b"x" * 1000
    _write("osm", 1, 0, 0, payload, age=timedelta(days=90))
    _write("osm", 1, 0, 1, payload, age=timedelta(days=1))

    usage = type("Usage", (), {"total": 0, "used": 0, "free": 500})()
    monkeypatch.setattr(tile_cache.shutil, "disk_usage", lambda path: usage)

    # Far under the cap, but the disk is 500 bytes short of a 1500-byte floor.
    summary = tile_cache.sweep(max_bytes=10 * 1024**3, min_free_bytes=1500)

    assert summary["evicted"] == 1, "should free the shortfall, not the whole cache"
    assert tile_cache.get("osm", 1, 0, 0) is None
    assert tile_cache.get("osm", 1, 0, 1) is not None
    assert summary["free_bytes"] == 1500


def test_sweep_with_the_cap_disabled_still_honours_the_free_space_floor(cache_dir, monkeypatch):
    """0 means "no size cap" — it must not also switch off the disk-full protection."""
    _write("osm", 1, 0, 0, b"x" * 1000, age=timedelta(days=90))

    usage = type("Usage", (), {"total": 0, "used": 0, "free": 0})()
    monkeypatch.setattr(tile_cache.shutil, "disk_usage", lambda path: usage)

    summary = tile_cache.sweep(max_bytes=0, min_free_bytes=500)

    assert summary["evicted"] == 1


def test_sweep_survives_a_file_it_cannot_delete(cache_dir, monkeypatch):
    """One undeletable file must not abandon the rest of an unattended nightly sweep."""
    payload = b"x" * 1000
    stubborn = _write("osm", 1, 0, 0, payload, age=timedelta(days=90))
    _write("osm", 1, 0, 1, payload, age=timedelta(days=60))
    _write("osm", 1, 0, 2, payload, age=timedelta(days=30))

    real_unlink = tile_cache.Path.unlink

    def _selective(self, missing_ok=False):
        if self == stubborn:
            raise OSError(errno.EACCES, "permission denied")
        return real_unlink(self, missing_ok=missing_ok)

    monkeypatch.setattr(tile_cache.Path, "unlink", _selective)

    summary = tile_cache.sweep(max_bytes=1000, min_free_bytes=0)

    # It skipped the stubborn one and kept going, rather than stopping at the first failure.
    assert summary["evicted"] == 2
    assert stubborn.exists()
    assert tile_cache.get("osm", 1, 0, 1) is None
    assert tile_cache.get("osm", 1, 0, 2) is None


def test_sweep_on_a_cache_that_was_never_written(cache_dir):
    summary = tile_cache.sweep(max_bytes=1000, min_free_bytes=1000)

    assert summary == {"tiles": 0, "bytes": 0, "evicted": 0, "evicted_bytes": 0, "free_bytes": 0}


def test_sweep_reports_cache_size(cache_dir):
    """The sweep summary is the only thing that reports tile-cache size — a gap
    docs/mobile/offline-tiles-spec.md notes explicitly."""
    _write("osm", 1, 0, 0, b"x" * 1000)
    _write("seamark", 1, 0, 0, b"y" * 500)

    summary = tile_cache.sweep(max_bytes=10 * 1024**3, min_free_bytes=0)

    assert summary["tiles"] == 2
    assert summary["bytes"] == 1500
