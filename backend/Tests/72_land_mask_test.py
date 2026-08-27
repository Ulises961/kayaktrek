"""Services/Utils/land_mask.py — the mmap-backed replacement for global_land_mask.

Two things need proving, and they are different:

1. **Mechanics** — materialise-then-mmap works, is atomic, survives a warm cache, and the
   index math handles clamping and out-of-range input. Driven against a small synthetic
   archive of the same shape as the real one, so it is fast and runs every time.
2. **Parity** — our answers match `global_land_mask.globe.is_land` on the real dataset.
   This is the test that makes the rewrite safe, and it is the only place in the codebase
   allowed to import that package (doing so costs ~890 MiB, which is the whole point of the
   module under test).

   It runs by default, at ~2s and a transient ~890 MiB in one xdist worker, because the
   synthetic tests structurally cannot replace it: they were green against an implementation
   that both indexed latitude upside-down *and* reported ocean as land. A fixture carries
   only the semantics its author already assumed, so the real archive is the only oracle for
   its own orientation and polarity — and a package bump could change either. Set
   LAND_MASK_SKIP_PARITY to opt out on a memory-constrained machine.
"""
import importlib
import os
import zipfile

import numpy as np
import pytest

import Services.Utils.land_mask as land_mask


# A miniature stand-in for globe_combined_mask_compressed.npz: same three members, same
# axis semantics (evenly spaced cell centres), a mask small enough to assert by hand.
#
# **Latitude descends and longitude ascends — matching the real archive, not intuition.**
# An earlier version of this fixture had both ascending, which made the synthetic tests
# pass against an implementation that collapsed every latitude to the south pole; the real
# dataset's orientation is the whole reason the clamping in _to_index is written the way it
# is. A fixture that disagrees with production data certifies the bug instead of catching
# it, so this asymmetry is load-bearing — do not "tidy" it.
_LAT = np.linspace(89.5, -89.5, 8)
_LON = np.linspace(-179.5, 179.5, 16)


@pytest.fixture
def fake_archive(tmp_path):
    # The stored member is an **ocean** mask, not a land mask — True means water. That is
    # the real archive's polarity (global_land_mask's own is_ocean() returns it unchanged
    # and is_land() negates it), and reading it the other way round nulls the sea and draws
    # current over land. Named `ocean` here so the inversion cannot be lost in a rename.
    ocean = np.zeros((_LAT.size, _LON.size), dtype=bool)
    # A recognisable patch of water so an index error shows up as a wrong answer rather
    # than a uniform array that any broken lookup would also produce.
    ocean[2:5, 3:7] = True

    path = tmp_path / "fake_mask.npz"
    np.savez_compressed(path, mask=ocean, lat=_LAT, lon=_LON)
    return path, ocean


@pytest.fixture
def module(tmp_path, fake_archive, monkeypatch):
    """A freshly-imported land_mask pointed at the synthetic archive and an empty cache."""
    archive, _ = fake_archive
    monkeypatch.setenv("LAND_MASK_NPZ", str(archive))
    monkeypatch.setenv("LAND_MASK_CACHE_DIR", str(tmp_path / "cache"))
    # The module reads both at import time and memoises the loaded mask in _state, so a
    # reload is what actually applies the env vars — without it every test in this file
    # would share whichever archive the first one happened to load.
    return importlib.reload(land_mask)


def _expected(ocean, lat, lon):
    # Deliberately written with min()/max() rather than reusing the module's own helper —
    # an oracle that shares the code under test can only ever agree with it. The trailing
    # `~` is the ocean-to-land inversion, kept explicit for the same reason.
    lat_index = ((np.clip(lat, _LAT.min(), _LAT.max()) - _LAT[0]) / (_LAT[1] - _LAT[0])).astype(int)
    lon_index = ((np.clip(lon, _LON.min(), _LON.max()) - _LON[0]) / (_LON[1] - _LON[0])).astype(int)
    return ~ocean[lat_index, lon_index]


def test_descending_latitude_axis_is_indexed_correctly(module, fake_archive):
    """Regression guard for the orientation bug the parity test caught.

    Latitude descends in the real archive. Clamping it with the axis endpoints passed
    positionally hands np.clip an a_min above its a_max, and numpy answers a_max for every
    input — every point silently reads as the south pole. Northern and southern latitudes
    must land on different rows.
    """
    _, ocean = fake_archive
    north, south = np.array([_LAT[0]]), np.array([_LAT[-1]])
    lon = np.array([_LON[5]])

    north_index = module._to_index(north, _LAT, 90.0, "latitude")
    south_index = module._to_index(south, _LAT, 90.0, "latitude")

    assert north_index[0] == 0, "the first axis element must map to row 0"
    assert south_index[0] == _LAT.size - 1, "the last must map to the last row"
    np.testing.assert_array_equal(module.is_land(north, lon), _expected(ocean, north, lon))
    np.testing.assert_array_equal(module.is_land(south, lon), _expected(ocean, south, lon))


def test_materialises_cache_then_answers_from_it(module, fake_archive, tmp_path):
    _, ocean = fake_archive
    cached = tmp_path / "cache" / "globe_mask.npy"
    assert not cached.exists(), "cache must not exist before first use"

    lat = np.array([_LAT[2], _LAT[6]])
    lon = np.array([_LON[4], _LON[1]])
    result = module.is_land(lat, lon)

    assert cached.exists(), "first use must materialise the cache"
    np.testing.assert_array_equal(result, _expected(ocean, lat, lon))
    # The patch was placed so this is a genuine mix — a uniform result would otherwise pass
    # against a lookup that is silently returning nothing. First point falls inside the
    # ocean patch (so: not land), second outside it (land).
    assert result.tolist() == [False, True]


def test_cache_is_uncompressed_and_memmapped_not_read_into_memory(module, fake_archive, tmp_path):
    _, ocean = fake_archive
    module.is_land(np.array([0.0]), np.array([0.0]))

    cached = tmp_path / "cache" / "globe_mask.npy"
    # Uncompressed on disk is what makes mmap possible at all — a compressed cache would
    # have to be read in full, which is the cost this module exists to avoid.
    assert cached.stat().st_size >= ocean.nbytes

    loaded = module._load()[0]
    assert isinstance(loaded, np.memmap), f"expected a memmap, got {type(loaded).__name__}"


def _record_opened_members(monkeypatch) -> list:
    """Capture every zip member read, so a test can assert what was and wasn't decompressed."""
    opened: list = []
    real_open = zipfile.ZipFile.open

    def _tracking_open(self, name, *args, **kwargs):
        opened.append(name if isinstance(name, str) else getattr(name, "filename", None))
        return real_open(self, name, *args, **kwargs)

    monkeypatch.setattr(zipfile.ZipFile, "open", _tracking_open)
    return opened


def test_warm_cache_never_re_materialises_the_mask(module, fake_archive, monkeypatch):
    """Generation is a one-off: a second process must mmap the cache, not decompress again.

    Note the source archive is still read on every load — but only for the `lat`/`lon` axes,
    which are ~500 KB. `mask.npy` is the 890 MiB member, and it is the one that must not be
    touched a second time.
    """
    _, ocean = fake_archive
    module.is_land(np.array([0.0]), np.array([0.0]))

    opened = _record_opened_members(monkeypatch)
    reloaded = importlib.reload(land_mask)

    lat = np.array([_LAT[3]])
    lon = np.array([_LON[5]])
    np.testing.assert_array_equal(reloaded.is_land(lat, lon), _expected(ocean, lat, lon))

    assert "mask.npy" not in opened, f"mask was decompressed again on a warm cache: {opened}"
    assert opened, "sanity: the axes are still read, so something must have been opened"


def test_partial_write_is_never_published(module, tmp_path, monkeypatch):
    """A failed materialise must leave no cache behind, not a truncated one.

    Without the atomic rename a crashed or killed first request would publish a short file
    that np.load then mmaps as a valid array of the wrong shape — a wrong-answers bug, not
    a crash, and one that persists across restarts.
    """
    cached = tmp_path / "cache" / "globe_mask.npy"

    def _explode(src, dst, length=0):
        dst.write(b"partial")
        raise OSError("disk full")

    monkeypatch.setattr(module.shutil, "copyfileobj", _explode)

    with pytest.raises(OSError):
        module.is_land(np.array([0.0]), np.array([0.0]))

    assert not cached.exists(), "a failed write must not publish a cache file"
    leftovers = list((tmp_path / "cache").glob("*.tmp"))
    assert leftovers == [], f"temp files left behind: {leftovers}"


def test_clamps_at_the_poles_and_antimeridian(module, fake_archive):
    """Exact +/-90 and +/-180 sit outside the last cell centre and must clamp, not overrun."""
    _, ocean = fake_archive
    lat = np.array([90.0, -90.0, 0.0])
    lon = np.array([180.0, -180.0, 0.0])

    result = module.is_land(lat, lon)
    np.testing.assert_array_equal(result, _expected(ocean, lat, lon))


@pytest.mark.parametrize(
    "lat, lon",
    [
        (np.array([91.0]), np.array([0.0])),
        (np.array([-90.5]), np.array([0.0])),
        (np.array([0.0]), np.array([181.0])),
        (np.array([0.0]), np.array([-180.5])),
    ],
)
def test_rejects_out_of_range_coordinates(module, lat, lon):
    with pytest.raises(ValueError):
        module.is_land(lat, lon)


def test_preserves_input_shape(module):
    grid_lat, grid_lon = np.meshgrid(np.linspace(-10, 10, 5), np.linspace(-10, 10, 4), indexing="ij")
    assert module.is_land(grid_lat, grid_lon).shape == (5, 4)


def test_source_npz_is_located_without_importing_the_package(monkeypatch, tmp_path):
    """Locating the data must not execute global_land_mask — importing it *is* the 890 MiB.

    `find_spec` resolves a module's path without running it; a stray `import
    global_land_mask` here would reintroduce the entire cost this module removes, in every
    process, silently.
    """
    monkeypatch.delenv("LAND_MASK_NPZ", raising=False)
    monkeypatch.setenv("LAND_MASK_CACHE_DIR", str(tmp_path))
    module = importlib.reload(land_mask)

    import sys

    monkeypatch.delitem(sys.modules, "global_land_mask", raising=False)
    monkeypatch.delitem(sys.modules, "global_land_mask.globe", raising=False)

    path = module._source_npz()

    assert path.name == "globe_combined_mask_compressed.npz"
    assert path.exists()
    assert "global_land_mask" not in sys.modules, "the package must not be imported"


def test_streams_the_mask_member_rather_than_decompressing_it(module, monkeypatch):
    """Generation must not hold the array in memory — otherwise first use spikes as hard
    as the import it replaces, and the backend's memory cap has to cover that spike."""
    opened = _record_opened_members(monkeypatch)

    module.is_land(np.array([0.0]), np.array([0.0]))

    # Read as a zip member stream, never via np.load(...)['mask'], which materialises the
    # whole array. Both routes produce the same file; only one is memory-flat.
    assert "mask.npy" in opened, f"mask was not streamed out of the archive: {opened}"


@pytest.mark.skipif(
    bool(os.environ.get("LAND_MASK_SKIP_PARITY")),
    reason="LAND_MASK_SKIP_PARITY set — opted out of the real-dataset parity check.",
)
def test_parity_with_global_land_mask(tmp_path, monkeypatch):
    """Our answers must match the package's on the real dataset, or this was a rewrite
    that quietly changed which cells render as land."""
    monkeypatch.delenv("LAND_MASK_NPZ", raising=False)
    monkeypatch.setenv("LAND_MASK_CACHE_DIR", str(tmp_path))
    module = importlib.reload(land_mask)

    from global_land_mask import globe  # the one sanctioned import; costs ~890 MiB

    rng = np.random.default_rng(20260827)
    lat = rng.uniform(-89.9, 89.9, 4000)
    lon = rng.uniform(-179.9, 179.9, 4000)

    # Plus deliberate edges and a stretch of real coastline, where an off-by-one in the
    # index math would show up and uniform random sampling (mostly open ocean) would not.
    lat = np.concatenate([lat, [90.0, -90.0, 0.0, 44.0, 43.5], np.linspace(43.0, 44.0, 200)])
    lon = np.concatenate([lon, [180.0, -180.0, 0.0, 9.0, 9.5], np.linspace(9.0, 10.0, 200)])

    ours = module.is_land(lat, lon)
    theirs = globe.is_land(lat, lon)

    mismatches = int(np.count_nonzero(ours != theirs))
    assert mismatches == 0, f"{mismatches} of {lat.size} points disagree with global_land_mask"
    # Guard against a vacuous pass: the sample must actually contain both land and sea.
    assert ours.any() and not ours.all(), "sample degenerate — proves nothing"
