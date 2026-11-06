import logging
from datetime import datetime, timedelta, timezone

import logfire
import requests

from Services import tile_cache

logger = logging.getLogger(__name__)

# Base-map and seamark tiles change slowly, and every refetch lands on the volunteer-run
# OSM and OpenSeaMap servers, so a cached tile is served for about three months.
FRESHNESS = timedelta(days=90)
REQUEST_TIMEOUT_SECONDS = 10
USER_AGENT = "KayakExpeditionPlanner/0.1 (+https://github.com/Ulises961/kayaktrek)"

_LAYER_UPSTREAM = {
    "osm": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "seamark": "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
}


class TileService:
    @staticmethod
    def get_tile(layer: str, z: int, x: int, y: int) -> tuple[bytes, str]:
        """Return (png bytes, content_type) for a map tile, serving from the local
        disk cache when fresh and re-fetching from upstream otherwise.

        Raises ValueError on an invalid layer or out-of-range coordinates.
        """
        if layer not in _LAYER_UPSTREAM:
            raise ValueError("invalid_layer")
        if not (0 <= z <= 19):
            raise ValueError("invalid_coords")
        max_index = 2**z
        if not (0 <= x < max_index and 0 <= y < max_index):
            raise ValueError("invalid_coords")

        cached = tile_cache.get(layer, z, x, y)
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

        tile_cache.put(layer, z, x, y, data)
        return data, "image/png"

    @staticmethod
    def _fetch_upstream(layer: str, z: int, x: int, y: int) -> bytes:
        url = _LAYER_UPSTREAM[layer].format(z=z, x=x, y=y)
        try:
            # Suppressed for the same reason `/api/v1/tiles/*` is excluded from Flask
            # auto-tracing (Api/observability.py) — a single map view bursts 30-60 tile
            # requests — which on its own only removed the Flask span and left this
            # `requests` one to arrive unparented. Nothing is lost: a cache miss is
            # uninteresting, and a *failed* fetch is reported by the warning below,
            # which still reaches Logfire via LogfireLoggingHandler.
            with logfire.suppress_instrumentation():
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
