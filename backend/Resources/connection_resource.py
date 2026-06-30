from http import HTTPStatus

import logging

from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy.exc import NoResultFound

from Schemas.connection_schema import ConnectionSchema
from Services.connection_service import ConnectionService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

CONNECTION_ENDPOINT = "/api/v1/connections"
connection_api = Blueprint("connection", __name__, url_prefix=CONNECTION_ENDPOINT)


@connection_api.route("", methods=["GET"])
@JWTService.authenticate_restful
def list_connections():
    """GET /api/v1/connections?status=pending|accepted — the caller's connections."""
    try:
        status = request.args.get("status")
        connections = ConnectionService.list_connections(g.current_user_id, status=status)
        return jsonify(ConnectionSchema(many=True).dump(connections)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error listing connections: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@connection_api.route("/request", methods=["POST"])
@JWTService.authenticate_restful
def request_connection():
    """POST /api/v1/connections/request — send a buddy request.

    Body: {"addresseeUsername": "<name>"} or {"addresseeId": "<uuid>"}.
    """
    try:
        body = request.get_json(silent=True) or {}
        addressee_username = body.get("addresseeUsername")
        addressee_id = body.get("addresseeId")
        if not addressee_username and not addressee_id:
            abort(
                HTTPStatus.BAD_REQUEST,
                description="'addresseeUsername' or 'addresseeId' is required",
            )
        connection = ConnectionService.request_connection(
            g.current_user_id,
            addressee_username=addressee_username,
            addressee_id=addressee_id,
        )
        return jsonify(ConnectionSchema().dump(connection)), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Paddler not found")


@connection_api.route("/<connection_id>/accept", methods=["POST"])
@JWTService.authenticate_restful
def accept_connection(connection_id: str):
    """POST /api/v1/connections/<id>/accept — addressee accepts a pending request."""
    try:
        connection = ConnectionService.accept_connection(connection_id, g.current_user_id)
        return jsonify(ConnectionSchema().dump(connection)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Connection not found")


@connection_api.route("/<connection_id>", methods=["DELETE"])
@JWTService.authenticate_restful
def remove_connection(connection_id: str):
    """DELETE /api/v1/connections/<id> — decline a pending request or unfriend."""
    try:
        ConnectionService.remove_connection(connection_id, g.current_user_id)
        return jsonify({"message": "Connection removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Connection not found")
