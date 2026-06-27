from http import HTTPStatus

from flask import Blueprint, jsonify
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
def get_public_float_plan(token: str):
    try:
        snapshot = LogisticsService.get_by_token(token)
        return jsonify(snapshot), HTTPStatus.OK
    except ValueError as e:
        if str(e) == "share_link_expired":
            logger.info("float_plan_link_expired", extra={"token_prefix": token[:8]})
        return jsonify({"error": "not_found"}), HTTPStatus.NOT_FOUND
    except NoResultFound:
        return jsonify({"error": "not_found"}), HTTPStatus.NOT_FOUND
