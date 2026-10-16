from http import HTTPStatus

from flask import Blueprint, Response
from flask.typing import ResponseReturnValue
from flask_limiter.util import get_remote_address
import logging

from Api.limiter import limiter
from Services.tile_service import TileService

logger = logging.getLogger(__name__)

TILE_ENDPOINT = "/api/v1/tiles"
tile_api = Blueprint("tile", __name__, url_prefix=TILE_ENDPOINT)


@tile_api.route("/<layer>/<int:z>/<int:x>/<int:y>.png", methods=["GET"])
# Sized for one device downloading a map region at full speed, not just panning. Kept
# bounded because the route is public and every cache miss is a request to OSM.
@limiter.limit("3000 per minute", key_func=get_remote_address)
def get_tile(layer: str, z: int, x: int, y: int) -> ResponseReturnValue:
    """
    ---
    get:
      summary: Proxy a map tile
      description: >
        Fetches and caches a tile from the upstream provider for the given layer
        (e.g. `seamark`) and XYZ coordinate.
      responses:
        200:
          description: The tile image
          content:
            image/png: {}
        404:
          description: Unknown layer or tile not found upstream
        502:
          description: Upstream tile provider unavailable
    """
    try:
        data, content_type = TileService.get_tile(layer, z, x, y)
    except ValueError as e:
        if str(e) == "upstream_unavailable":
            return Response(status=HTTPStatus.BAD_GATEWAY)
        return Response(status=HTTPStatus.NOT_FOUND)

    return Response(
        data,
        mimetype=content_type,
        headers={"Cache-Control": "public, max-age=604800"},
    )
