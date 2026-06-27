from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort
from werkzeug.exceptions import HTTPException
from sqlalchemy.exc import NoResultFound

from Schemas.personal_packing_item_schema import PersonalPackingItemSchema
from Services.personal_packing_service import PersonalPackingService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

PACKING_ENDPOINT = "/api/v1/packing"
personal_packing_api = Blueprint('personal_packing', __name__, url_prefix=PACKING_ENDPOINT)


@personal_packing_api.route("/trip/<string:trip_id>", methods=["GET"])
@JWTService.authenticate_restful
def list_packing(trip_id: str):
    """GET /api/packing/trip/<trip_id> — the caller's own packing list for a trip."""
    try:
        items = PersonalPackingService.list_for_trip(trip_id)
        return jsonify([PersonalPackingItemSchema().dump(i) for i in items]), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error(f"Error listing packing items: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@personal_packing_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def add_packing():
    """POST /api/packing/create — Body: {"tripId": "<uuid>", "itemId": "<uuid>"}.
    Adds one of the caller's owned items to their private packing list for the trip."""
    try:
        body = request.get_json() or {}
        trip_id = body.get("tripId")
        item_id = body.get("itemId")
        if not trip_id or not item_id:
            abort(HTTPStatus.BAD_REQUEST, description="tripId and itemId are required")
        entry = PersonalPackingService.add_item(trip_id, item_id)
        return jsonify(PersonalPackingItemSchema().dump(entry)), HTTPStatus.CREATED
    except HTTPException:
        raise
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error adding packing item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@personal_packing_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
def update_packing(id: str):
    """PATCH /api/packing/<id> — Body: {"checked": bool}. Toggles packed state on the
    caller's own entry."""
    try:
        body = request.get_json() or {}
        checked = body.get("checked")
        if checked is None:
            abort(HTTPStatus.BAD_REQUEST, description="checked is required")
        if not isinstance(checked, bool):
            abort(HTTPStatus.BAD_REQUEST, description="checked must be a boolean")
        entry = PersonalPackingService.set_checked(id, checked)
        return jsonify(PersonalPackingItemSchema().dump(entry)), HTTPStatus.OK
    except HTTPException:
        raise
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error(f"Error updating packing item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@personal_packing_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_packing(id: str):
    """DELETE /api/packing/<id> — Remove the caller's own packing entry."""
    try:
        PersonalPackingService.remove(id)
        return jsonify({"message": "Packing item removed"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error(f"Error removing packing item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
