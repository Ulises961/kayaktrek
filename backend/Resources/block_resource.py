from http import HTTPStatus

import logging

from flask import Blueprint, abort, g, jsonify, request
from flask.typing import ResponseReturnValue
from sqlalchemy.exc import NoResultFound

from Schemas.block_schema import BlockSchema
from Services.block_service import BlockService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

BLOCK_ENDPOINT = "/api/v1/blocks"
block_api = Blueprint("block", __name__, url_prefix=BLOCK_ENDPOINT)


@block_api.route("", methods=["GET"])
@JWTService.authenticate_restful
def list_blocks() -> ResponseReturnValue:
    """
    GET /api/v1/blocks — the caller's block list.
    ---
    get:
      summary: List the caller's blocked paddlers
      description: Newest first.
      responses:
        200:
          description: The caller's blocks
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/BlockSchema'
    """
    blocks = BlockService.list_blocks(g.current_user_id)
    return jsonify(BlockSchema(many=True).dump(blocks)), HTTPStatus.OK


@block_api.route("", methods=["POST"])
@JWTService.authenticate_restful
def create_block() -> ResponseReturnValue:
    """
    POST /api/v1/blocks — block a paddler.

    Body: {"blockedUsername": "<name>"} or {"blockedId": "<uuid>"}.
    ---
    post:
      summary: Block a paddler
      description: >
        Tears down any existing connection as a hard reset. Exactly one of
        blockedUsername or blockedId identifies the target.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                blockedUsername:
                  type: string
                blockedId:
                  type: string
                  format: uuid
      responses:
        201:
          description: The created block
          content:
            application/json:
              schema: BlockSchema
        400:
          description: Neither blockedUsername nor blockedId was provided
        403:
          description: Caller attempted to block themselves
        404:
          description: Target paddler not found
        409:
          description: This paddler is already blocked
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
def remove_block(block_id: str) -> ResponseReturnValue:
    """
    DELETE /api/v1/blocks/<id> — unblock (does not restore the prior relationship).
    ---
    delete:
      summary: Remove a block
      description: Only the blocker may remove their own block.
      responses:
        200:
          description: Removal confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        403:
          description: Caller is not the blocker on this block
        404:
          description: Block not found
    """
    try:
        BlockService.remove_block(block_id, g.current_user_id)
        return jsonify({"message": "Block removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Block not found")
