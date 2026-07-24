from http import HTTPStatus

from flask import Blueprint, Response
from flask_limiter.util import get_remote_address
import logging

from Api.limiter import limiter
from Services.tile_service import TileService

logger = logging.getLogger(__name__)

TILE_ENDPOINT = "/api/v1/tiles"
tile_api = Blueprint("tile", __name__, url_prefix=TILE_ENDPOINT)


@tile_api.route("/<layer>/<int:z>/<int:x>/<int:y>.png", methods=["GET"])
@limiter.limit("600 per minute", key_func=get_remote_address)
def get_tile(layer: str, z: int, x: int, y: int):
    try:
        data, content_type = TileService.get_tile(layer, z, x, y)
    except ValueError as e:
        if str(e) == "upstream_unavailable":
            return Response(status=HTTPStatus.BAD_GATEWAY)
        return Response(status=HTTPStatus.NOT_FOUND)

    return Response(
        data,
        mimetype=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
