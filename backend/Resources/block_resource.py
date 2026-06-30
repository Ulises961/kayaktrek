from http import HTTPStatus

import logging

from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy.exc import NoResultFound

from Schemas.block_schema import BlockSchema
from Services.block_service import BlockService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

BLOCK_ENDPOINT = "/api/v1/blocks"
block_api = Blueprint("block", __name__, url_prefix=BLOCK_ENDPOINT)


@block_api.route("", methods=["GET"])
@JWTService.authenticate_restful
def list_blocks():
    """GET /api/v1/blocks — the caller's block list."""
    try:
        blocks = BlockService.list_blocks(g.current_user_id)
        return jsonify(BlockSchema(many=True).dump(blocks)), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error listing blocks: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@block_api.route("", methods=["POST"])
@JWTService.authenticate_restful
def create_block():
    """POST /api/v1/blocks — block a paddler.

    Body: {"blockedUsername": "<name>"} or {"blockedId": "<uuid>"}.
    """
    try:
        body = request.get_json(silent=True) or {}
        blocked_username = body.get("blockedUsername")
        blocked_id = body.get("blockedId")
        if not blocked_username and not blocked_id:
            abort(
                HTTPStatus.BAD_REQUEST,
                description="'blockedUsername' or 'blockedId' is required",
            )
        block = BlockService.create_block(
            g.current_user_id,
            blocked_username=blocked_username,
            blocked_id=blocked_id,
        )
        return jsonify(BlockSchema().dump(block)), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Paddler not found")


@block_api.route("/<block_id>", methods=["DELETE"])
@JWTService.authenticate_restful
def remove_block(block_id: str):
    """DELETE /api/v1/blocks/<id> — unblock (does not restore the prior relationship)."""
    try:
        BlockService.remove_block(block_id, g.current_user_id)
        return jsonify({"message": "Block removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Block not found")
