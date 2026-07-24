import logging
from datetime import datetime, timedelta, timezone

import requests

from Services.storage_service import StorageService

logger = logging.getLogger(__name__)

FRESHNESS = timedelta(days=7)
REQUEST_TIMEOUT_SECONDS = 10
USER_AGENT = "KayakExpeditionPlanner/0.1 (+https://github.com/Ulises961/kayak-expedition-planner)"

_LAYER_UPSTREAM = {
    "osm": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "seamark": "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
}


class TileService:
    @staticmethod
    def get_tile(layer: str, z: int, x: int, y: int) -> tuple[bytes, str]:
        """Return (png bytes, content_type) for a map tile, serving from the
        MinIO cache when fresh and re-fetching from upstream otherwise.

        Raises ValueError on an invalid layer or out-of-range coordinates.
        """
        if layer not in _LAYER_UPSTREAM:
            raise ValueError("invalid_layer")
        if not (0 <= z <= 19):
            raise ValueError("invalid_coords")
        max_index = 2**z
        if not (0 <= x < max_index and 0 <= y < max_index):
            raise ValueError("invalid_coords")

        key = f"tiles/{layer}/{z}/{x}/{y}.png"

        cached = StorageService.get_object_with_age(key)
        if cached is not None:
            data, last_modified = cached
            if datetime.now(timezone.utc) - last_modified < FRESHNESS:
                return data, "image/png"

        try:
            data = TileService._fetch_upstream(layer, z, x, y)
        except ValueError:
            # Upstream is down. A stale cached copy beats a 502 — Leaflet still
            # gets a usable (if outdated) tile; only a true cache miss propagates.
            if cached is not None:
                return cached[0], "image/png"
            raise

        StorageService.put_object(key, data, "image/png")
        return data, "image/png"

    @staticmethod
    def _fetch_upstream(layer: str, z: int, x: int, y: int) -> bytes:
        url = _LAYER_UPSTREAM[layer].format(z=z, x=x, y=y)
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except requests.RequestException as e:
            logger.warning("tile_upstream_failed", extra={"layer": layer, "z": z, "x": x, "y": y, "error": str(e)})
            raise ValueError("upstream_unavailable")
        return response.content
