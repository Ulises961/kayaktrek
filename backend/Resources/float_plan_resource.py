from http import HTTPStatus

from flask import Blueprint, jsonify
from flask.typing import ResponseReturnValue
from flask_limiter.util import get_remote_address
from sqlalchemy.exc import NoResultFound
import logging

from Api.limiter import limiter
from Services.logistics_service import LogisticsService

logger = logging.getLogger(__name__)

FLOAT_PLAN_ENDPOINT = "/api/v1/float-plan"
float_plan_api = Blueprint("float_plan", __name__, url_prefix=FLOAT_PLAN_ENDPOINT)


@float_plan_api.route("/public/<token>", methods=["GET"])
@limiter.limit("30 per minute", key_func=get_remote_address)
def get_public_float_plan(token: str) -> ResponseReturnValue:
    """
    ---
    get:
      summary: Get a public float plan by its share token
      description: >
        No auth — the share token itself is the credential. Returns a frozen
        snapshot generated when the leader last shared the float plan, not a live
        read of the trip. Medical notes are never included in the snapshot.
      responses:
        200:
          description: The float plan snapshot
          content:
            application/json:
              schema:
                type: object
                properties:
                  generatedAt:
                    type: string
                    format: date-time
                  trip:
                    type: object
                    properties:
                      destination:
                        type: string
                      dateFrom:
                        type: string
                        format: date
                      dateTo:
                        type: string
                        format: date
                  shoreContact:
                    type: object
                    nullable: true
                    properties:
                      name:
                        type: string
                      email:
                        type: string
                      phone:
                        type: string
                      relationship:
                        type: string
                  crew:
                    type: array
                    items:
                      type: object
                      properties:
                        name:
                          type: string
                        mail:
                          type: string
                        role:
                          type: string
                        floatPlanConfirmedAt:
                          type: string
                          format: date-time
                          nullable: true
                        vessel:
                          type: object
                          properties:
                            make:
                              type: string
                            model:
                              type: string
                            lengthCm:
                              type: integer
                            colorPrimary:
                              type: string
                            colorSecondary:
                              type: string
                        emergencyContact:
                          type: object
                          properties:
                            name:
                              type: string
                            phone:
                              type: string
                            relationship:
                              type: string
        404:
          description: Token unknown, snapshot not yet generated, or link expired
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
    """
    try:
        snapshot = LogisticsService.get_by_token(token)
        return jsonify(snapshot), HTTPStatus.OK
    except ValueError as e:
        if str(e) == "share_link_expired":
            logger.info("float_plan_link_expired", extra={"token_prefix": token[:8]})
        return jsonify({"error": "not_found"}), HTTPStatus.NOT_FOUND
    except NoResultFound:
        return jsonify({"error": "not_found"}), HTTPStatus.NOT_FOUND
