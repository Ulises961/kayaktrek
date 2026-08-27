"""Memory-frugal access to the global 1 km land/sea mask.

The `global_land_mask` package answers "is this point on land?" from a
(21600, 43200) boolean grid — 933,120,128 points, ~890 MiB uncompressed. It ships that
grid as a 2.4 MB compressed `.npz` and decompresses **all of it at import time**:
`global_land_mask/__init__.py` is `from .globe import *`, and `globe.py` does
`_mask = _mask_fid['mask']` at module level. Merely importing the package anywhere in the
process tree therefore costs ~890 MiB of resident, non-reclaimable memory, whether or not
a single point is ever tested.

That is what this module exists to avoid. Same dataset, same resolution, same answers —
but the mask is decompressed **once** to an uncompressed `.npy` on disk and thereafter
read through `mmap`, so only the pages actually touched become resident, and those are
page cache the kernel can reclaim under pressure and share between processes.

The call site is a 24x24 velocity grid: 576 points. Reading 933 million booleans to test
576 of them was the whole problem.

Two rules this module must not break:

1. **Never `import global_land_mask`** (nor any submodule). That is the 890 MiB. The `.npz`
   is located with `importlib.util.find_spec`, which resolves a module's path *without*
   executing it.
2. **Never read the `mask` member through `np.load()[...]`.** `np.load` on an `.npz` is
   lazily per-array, so reading `lat`/`lon` is cheap (~500 KB) and safe — but touching
   `['mask']` decompresses the full array into memory, which is the same cost by another
   route. It is streamed out of the zip instead, in `_materialise`.
"""
import logging
import os
import shutil
import tempfile
import threading
import zipfile
from importlib.util import find_spec
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Where the decompressed mask is cached.
#
# Defaults to a temp directory, and the deployment opts *in* to a persistent one by setting
# LAND_MASK_CACHE_DIR (both compose files point the backend and worker at the volume mounted
# on /var/cache/kayak/land-mask). That direction matters: the default has to work unprivileged
# — on a dev machine, in CI, and under pytest, none of which can write to /var/cache — and a
# default that only works inside a container turns into a fallback, which would silently
# re-decompress ~890 MiB on every production start with nothing to show for it.
_CACHE_DIR = Path(
    os.environ.get("LAND_MASK_CACHE_DIR") or Path(tempfile.gettempdir()) / "kayak-land-mask"
)
_MASK_CACHE_NAME = "globe_mask.npy"

# Overridable so tests can point at a small synthetic archive of the same shape rather
# than materialising the real 890 MiB one.
_NPZ_OVERRIDE = os.environ.get("LAND_MASK_NPZ")

_MASK_MEMBER = "mask.npy"
_COPY_CHUNK = 4 * 1024 * 1024

# (memmapped mask, lat axis, lon axis), built once per process.
_state: Optional[tuple] = None
_state_lock = threading.Lock()


def _source_npz() -> Path:
    if _NPZ_OVERRIDE:
        return Path(_NPZ_OVERRIDE)

    # find_spec resolves the package's location without executing its __init__, which is
    # the entire point — importing it is the cost this module exists to avoid.
    spec = find_spec("global_land_mask")
    if spec is None or not spec.origin:
        raise RuntimeError("global_land_mask is not installed; cannot build the land mask")
    return Path(spec.origin).parent / "globe_combined_mask_compressed.npz"


def _materialise(npz_path: Path, target: Path) -> None:
    """Decompress the mask member to an uncompressed .npy at `target`.

    The member is itself a well-formed `.npy` (header included), so copying the stream
    verbatim produces a file `np.load` can mmap. Streaming rather than
    `np.save(np.load(npz)['mask'])` keeps peak memory at one chunk instead of ~890 MiB —
    without that, first use would spike exactly as hard as the import it replaces, just
    once instead of forever.
    """
    target.parent.mkdir(parents=True, exist_ok=True)

    # Written under a pid-unique name and renamed into place. Two gunicorn workers can
    # reach first use simultaneously; os.replace is atomic on POSIX, so the loser's copy
    # is discarded whole rather than a half-written file being mmapped by the winner.
    tmp = target.with_name(f"{target.name}.{os.getpid()}.tmp")
    try:
        with zipfile.ZipFile(npz_path) as archive:
            with archive.open(_MASK_MEMBER) as src, open(tmp, "wb") as dst:
                shutil.copyfileobj(src, dst, _COPY_CHUNK)
        os.replace(tmp, target)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise

    logger.info(
        "land_mask_materialised", extra={"path": str(target), "bytes": target.stat().st_size}
    )


def _load() -> tuple:
    global _state
    if _state is not None:
        return _state

    with _state_lock:
        if _state is not None:
            return _state

        npz_path = _source_npz()
        cached = _CACHE_DIR / _MASK_CACHE_NAME
        if not cached.exists():
            _materialise(npz_path, cached)

        mask = np.load(cached, mmap_mode="r")
        # Safe to read through np.load: NpzFile is lazy per member, and these two are
        # ~170 KB and ~340 KB. Only 'mask' is the expensive one.
        with np.load(npz_path) as archive:
            lat_axis = archive["lat"]
            lon_axis = archive["lon"]

        _state = (mask, lat_axis, lon_axis)
    return _state


def _to_index(values, axis: np.ndarray, limit: float, name: str) -> np.ndarray:
    if np.any(np.abs(values) > limit):
        raise ValueError(f"{name} must be within +/-{limit:g}")

    # Clamped to the axis before indexing: the axis samples cell centres, so a coordinate
    # at exactly +/-90 or +/-180 lies just outside the last centre and would index off the
    # end. np.clip rather than boolean assignment so 0-d (scalar) input works too.
    #
    # min()/max() and NOT axis[0]/axis[-1]: **the latitude axis runs descending** (90.0 down
    # to -89.99, negative step) while longitude ascends, so the first element is the upper
    # bound for one and the lower bound for the other. Passing them positionally gives
    # np.clip an a_min above its a_max for latitude, and numpy then returns a_max for every
    # value — silently collapsing every point to the south pole rather than raising.
    clamped = np.clip(values, axis.min(), axis.max())

    # The step carries the axis direction (negative for latitude), so this stays a plain
    # offset-and-scale in both orientations.
    step = axis[1] - axis[0]
    return ((clamped - axis[0]) / step).astype(int)


def is_land(lat, lon) -> np.ndarray:
    """Return a boolean array (matching the inputs' shape) — True where the point is land.

    Equivalent to `global_land_mask.globe.is_land`, including its clamping at the poles
    and the antimeridian, but without the resident cost. Verified against the package
    itself in `Tests/70_land_mask_test.py`.
    """
    mask, lat_axis, lon_axis = _load()

    lat_arr = np.asarray(lat, dtype=float)
    lon_arr = np.asarray(lon, dtype=float)

    lat_index = _to_index(lat_arr, lat_axis, 90.0, "latitude")
    lon_index = _to_index(lon_arr, lon_axis, 180.0, "longitude")

    # Fancy indexing gathers element-wise from the memmap, so this touches only the pages
    # holding those points — ~2 MB for a 24x24 grid — and returns a plain in-memory array
    # rather than a view that would keep the mapping alive.
    #
    # Inverted, and this is not a detail: the stored member is an **ocean** mask. The
    # package's own is_ocean() returns `_mask[lat_i, lon_i]` unchanged and its is_land()
    # negates it. Reading it as land renders the velocity field over land and nulls the
    # sea — the exact inverse of what mask_land is for, on a marine chart.
    return np.asarray(~mask[lat_index, lon_index])
