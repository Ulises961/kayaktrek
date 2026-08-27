"""On-disk cache for proxied map tiles.

Tiles used to be cached in the object store, which was right while that store was a MinIO
container on the same Docker network and wrong the moment production moved to Cloudflare R2:
the proxy reads tile bytes into Flask and re-serves them, so the browser never talks to the
object store directly and R2's free egress buys nothing here. Every cache *hit* became a WAN
round trip out to Cloudflare and back before the box could answer — all the cost of proxying,
plus a hop, with none of the CDN benefit that justified the migration. `storage_service.py`
flagged this at the time and deliberately left it alone as behaviour-preserving.

Tiles are also the one thing in the store with no durability requirement whatsoever: a lost
tile is one upstream refetch. They have a single reader (only `backend` serves the proxy) and
no cross-host consumer. So this is a plain directory, not an S3 bucket — no per-request
signing, no client, and eviction is a walk instead of a lifecycle rule.

**Sizing is not a cost control.** Storage is pennies either way. The cap exists because on a
one-box deployment the tile cache shares a filesystem with Postgres, and a full disk stops
Postgres writing WAL. Being stingy is actively counterproductive: eviction pressure pushes
load back onto OpenStreetMap's tile servers, which is the party least worth leaning on.

Freshness and eviction both key on **mtime**, deliberately, rather than atime. atime depends
on mount options — a host mounted `noatime` (common on SSDs) never updates it, and eviction
would then delete hot tiles on a schedule with nothing to explain it. mtime works because
`TileService` rewrites a tile when it refetches past FRESHNESS: a tile still being requested
gets its mtime reset every 7 days, while one nobody asks for keeps an old one. That makes
mtime "last accessed, +/- the freshness window" with no bookkeeping and no mount dependency.
"""
import errno
import logging
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Defaults to a temp directory; the deployment opts *in* to a persistent one, same as
# Services/Utils/land_mask.py. A default under /var/cache only works inside the container and
# would silently become a fallback everywhere else.
_CACHE_DIR = Path(os.environ.get("TILE_CACHE_DIR") or Path(tempfile.gettempdir()) / "kayak-tiles")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("tile_cache_bad_env", extra={"var": name, "value": raw})
        return default


# 5 GiB. Derived rather than picked: the cache grows with distinct *geography*, not with user
# count — everyone paddling the same coast shares the same tiles. That is roughly 1 GiB for
# the whole world at overview zooms (z0-8, both layers) plus ~80 MB per planning region at
# z9-14, so this holds the global base plus ~50 regions. 0 disables the cap entirely, which
# is a reasonable setting on a dev box where the disk is not shared with anything that matters.
_MAX_BYTES = _int_env("TILE_CACHE_MAX_BYTES", 5 * 1024**3)

# The condition that actually protects Postgres. It is the only rule here that responds to
# something *other* than tiles growing — image layers, log growth, a pg_dump staged before
# its upload — so a sweep can free space it did not itself consume.
_MIN_FREE_BYTES = _int_env("TILE_CACHE_MIN_FREE_BYTES", 10 * 1024**3)

# Evict past the threshold rather than exactly to it, so a sweep that just clears the bar is
# not immediately over it again on the next tile written.
_LOW_WATER = 0.9


def _tile_path(layer: str, z: int, x: int, y: int) -> Path:
    # z/x/y are ints by the time they arrive (Flask's <int:...> converters) and `layer` is
    # checked against a whitelist in TileService before any of this is reached. Re-checking
    # the separator anyway because this builds a filesystem path from request-shaped input,
    # and that check costs nothing next to what it would prevent.
    if "/" in layer or "\\" in layer or layer in (".", ".."):
        raise ValueError("invalid_layer")
    return _CACHE_DIR / layer / str(int(z)) / str(int(x)) / f"{int(y)}.png"


def get(layer: str, z: int, x: int, y: int) -> Optional[tuple[bytes, datetime]]:
    """Return (bytes, last-modified) for a cached tile, or None if it isn't cached."""
    path = _tile_path(layer, z, x, y)
    try:
        data = path.read_bytes()
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except FileNotFoundError:
        # Also covers losing a race with the eviction sweep between stat and read.
        return None
    except OSError as error:
        logger.warning("tile_cache_read_failed", extra={"layer": layer, "z": z, "x": x, "y": y, "error": str(error)})
        return None
    return data, modified


def put(layer: str, z: int, x: int, y: int, data: bytes) -> None:
    """Cache a tile. Never raises — a cache that cannot write must not fail the request."""
    path = _tile_path(layer, z, x, y)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write-then-rename, because two requests for the same missing tile fetch and write
        # concurrently. S3 gave atomicity for free; open().write() does not, and a reader
        # landing on a half-written PNG gets a broken tile rather than an error. os.replace
        # is atomic on POSIX, and the temp file is in the same directory so it stays on the
        # same filesystem — a cross-device rename is not atomic and would fall back to a copy.
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        try:
            tmp.write_bytes(data)
            os.replace(tmp, path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    except OSError as error:
        # ENOSPC is the one worth naming: the disk is full, the sweep has not caught up, and
        # the correct behaviour is to serve the tile and move on rather than 500 a map pan.
        logger.warning(
            "tile_cache_write_failed",
            extra={"layer": layer, "z": z, "x": x, "y": y, "error": str(error), "no_space": error.errno == errno.ENOSPC},
        )


def sweep(max_bytes: int = _MAX_BYTES, min_free_bytes: int = _MIN_FREE_BYTES) -> dict:
    """Evict oldest-first until the cache is under its cap and the disk has free headroom.

    Returns a summary dict — also the only place that reports cache size at all, which is
    what `docs/mobile/offline-tiles-spec.md` notes nothing currently does.
    """
    if not _CACHE_DIR.exists():
        return {"tiles": 0, "bytes": 0, "evicted": 0, "evicted_bytes": 0, "free_bytes": 0}

    tiles: list[tuple[float, int, Path]] = []
    total = 0
    for path in _CACHE_DIR.rglob("*.png"):
        try:
            stat = path.stat()
        except OSError:
            # Vanished mid-walk (a concurrent sweep, or a manual clear). Not an error.
            continue
        tiles.append((stat.st_mtime, stat.st_size, path))
        total += stat.st_size

    free = shutil.disk_usage(_CACHE_DIR).free

    over_cap = total - int(max_bytes * _LOW_WATER) if max_bytes > 0 else 0
    # Deleting tiles is what frees the disk, so the shortfall is expressed in tile bytes too.
    short_of_floor = min_free_bytes - free if min_free_bytes > 0 else 0
    to_free = max(over_cap, short_of_floor, 0)

    evicted = evicted_bytes = 0
    if to_free > 0:
        tiles.sort(key=lambda entry: entry[0])  # oldest mtime first
        for _, size, path in tiles:
            if evicted_bytes >= to_free:
                break
            try:
                path.unlink()
            except FileNotFoundError:
                continue
            except OSError as error:
                # Per-item isolation: one undeletable file must not abandon the rest of an
                # unattended sweep, which is the whole point of running it on a schedule.
                logger.warning("tile_cache_evict_failed", extra={"path": str(path), "error": str(error)})
                continue
            evicted += 1
            evicted_bytes += size

    summary = {
        "tiles": len(tiles) - evicted,
        "bytes": total - evicted_bytes,
        "evicted": evicted,
        "evicted_bytes": evicted_bytes,
        "free_bytes": free + evicted_bytes,
    }
    logger.info("tile_cache_swept", extra=summary)
    return summary
