import os
from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.logistics_schema import LogisticsSchema
from Services.logistics_service import LogisticsService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

LOGISTICS_ENDPOINT = "/api/v1/logistics"
logistics_api = Blueprint("logistics", __name__, url_prefix=LOGISTICS_ENDPOINT)


@logistics_api.route("/<trip_id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def get_logistics(trip_id: str):
    """
    LogisticsResource GET method. Retrieves the float plan logistics for a trip.
    ---
    get:
      summary: Get a trip's logistics
      description: Returns an empty object if the trip has no logistics yet.
      responses:
        200:
          description: The trip's logistics, or an empty object if none exist
          content:
            application/json:
              schema: LogisticsSchema
    """
    logistics = LogisticsService.get(trip_id)
    if not logistics:
        return jsonify({}), HTTPStatus.OK
    return jsonify(LogisticsSchema().dump(logistics)), HTTPStatus.OK


@logistics_api.route("/<trip_id>", methods=["PUT"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def upsert_logistics(trip_id: str):
    """
    LogisticsResource PUT method. Creates or replaces a trip's logistics.
    ---
    put:
      summary: Create or replace a trip's logistics
      description: Shore-contact fields are leader-only; a crew member sending one is rejected.
      requestBody:
        content:
          application/json:
            schema: LogisticsSchema
      responses:
        200:
          description: The upserted logistics
          content:
            application/json:
              schema: LogisticsSchema
        400:
          description: Trip not found, or other value error
        403:
          description: A crew member tried to write a leader-only field
        422:
          description: Validation error
    """
    try:
        body = LogisticsSchema().load(request.get_json(silent=True) or {})
        logistics = LogisticsService.upsert(trip_id, body, g.current_user_id)
        return jsonify(LogisticsSchema().dump(logistics)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except (NoResultFound, ValueError) as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("logistics_upsert_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@logistics_api.route("/<trip_id>/share", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def generate_share(trip_id: str):
    """
    LogisticsResource POST method. Generates (or rotates) the trip's public float plan share token.
    ---
    post:
      summary: Generate the float plan share link
      description: Leader-only.
      responses:
        200:
          description: The logistics with a fresh share_token
          content:
            application/json:
              schema: LogisticsSchema
        403:
          description: Caller is not the trip leader
        404:
          description: Trip not found
    """
    try:
        logistics = LogisticsService.generate_share(trip_id, g.current_user_id)
        return jsonify(LogisticsSchema().dump(logistics)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("float_plan_share_generate_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@logistics_api.route("/<trip_id>/share/email", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def send_share_email(trip_id: str):
    """
    LogisticsResource POST method. Emails the float plan share link to the shore contact.
    ---
    post:
      summary: Email the float plan link to the shore contact
      description: Leader-only.
      responses:
        204:
          description: Email sent
        400:
          description: No shore contact email on file
        403:
          description: Caller is not the trip leader
        404:
          description: Trip not found
    """
    try:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        LogisticsService.send_share_email(trip_id, g.current_user_id, frontend_url)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error("float_plan_share_email_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
