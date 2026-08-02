import logging
from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, abort, g, jsonify

from Schemas.session_schema import SessionSchema
from Services.session_service import SessionService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

SESSION_ENDPOINT = "/api/v1/sessions"
session_api = Blueprint("session", __name__, url_prefix=SESSION_ENDPOINT)


@session_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def list_sessions():
    """
    Lists the caller's own active devices. This is the pull channel for suspicious-activity
    disclosure (M17): rather than emailing on every reuse signal, a user can look at where
    their account is signed in whenever they want to.
    ---
    get:
      summary: List the caller's active sessions
      responses:
        200:
          description: Active sessions, most recently used first
          content:
            application/json:
              schema:
                type: array
                items: SessionSchema
    """
    sessions = SessionService.list_for_user(UUID(str(g.current_user_id)))
    for session in sessions:
        session.is_current = str(session.id) == str(g.current_session_id)
    return jsonify(SessionSchema(many=True).dump(sessions)), HTTPStatus.OK


@session_api.route("/<uuid:session_id>", methods=["DELETE"])
@JWTService.authenticate_restful
def revoke_session(session_id):
    """
    ---
    delete:
      summary: Sign out one device
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        200:
          description: Session revoked
        404:
          description: No such active session for this user
    """
    session = SessionService.get_usable(str(session_id), UUID(str(g.current_user_id)))
    if not session:
        abort(HTTPStatus.NOT_FOUND, description="Session not found")
    SessionService.revoke(session, reason="user_revoked_device")
    return jsonify({"status": "success", "message": "Session revoked"}), HTTPStatus.OK
