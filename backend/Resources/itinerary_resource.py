from http import HTTPStatus
import logging
from flask import Blueprint, g, jsonify, request, abort
from werkzeug.exceptions import HTTPException
from sqlalchemy.exc import IntegrityError, NoResultFound
from Schemas.itinerary_shema import ItinerarySchema
from Models.itinerary import Itinerary
from Api.database import db
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.itinerary_service import ItineraryService

# It will print the name of this module when the main app is running
logger = logging.getLogger(__name__)

ITINERARY_ENDPOINT = "/api/itinerary"
itinerary_api = Blueprint("itinerary", __name__, url_prefix=ITINERARY_ENDPOINT)

@itinerary_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_itineraries():
    """GET /api/itinerary - Retrieve all itineraries"""
    try:
        logger.info("Retrieve all itineraries from db")
        itineraries = ItineraryService.get_itineraries_by_user(g.current_user_id)

        return jsonify([ItinerarySchema().dump(itinerary) for itinerary in itineraries]), HTTPStatus.OK
        
    except Exception as e:
        logger.error(f"Error retrieving itineraries: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@itinerary_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('itinerary', read_only=True)
def get_itinerary(id: str):
    """GET /api/itinerary/<id> - Retrieve itinerary by ID"""
    logger.info(f"Retrieve itinerary with id {id}")
    
    itinerary = ItineraryService.get_itinerary_by_id(id)
    
    if not itinerary:
        abort(HTTPStatus.NOT_FOUND, description=f"Itinerary with id {id} not found")
    
    schema = ItinerarySchema()
    schema.include_staging = True
    return jsonify(schema.dump(itinerary)), HTTPStatus.OK

@itinerary_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('itinerary', parent_resource=('trip', 'tripId'), from_body=True)
def create_itinerary():
    """POST /api/itinerary/create - Create new itinerary"""
    try:
        itinerary = ItineraryService.create_itinerary(request.get_json())
        schema = ItinerarySchema()
        schema.include_staging = True
        return jsonify(schema.dump(itinerary)), HTTPStatus.CREATED
        
    except HTTPException as e:
        logger.exception(f"Integrity error creating itinerary: {e}")

        raise
    except IntegrityError as e:
        logger.error(f"Integrity error creating itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.error(f"Error creating itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@itinerary_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def update_itinerary(id: str):
    """
    PATCH /api/itinerary/<id> — Partially update an existing itinerary.

    Accepts a JSON body with any subset of mutable itinerary fields (isPublic, totalMiles).
    Only the fields present in the body are applied; omitted fields are left unchanged.

    Returns:
        200 with the updated itinerary object, or 404 if not found.
    """
    try:
        itinerary_data = request.get_json()
        updated_itinerary = ItineraryService.update_itinerary(id, itinerary_data)
        return jsonify(ItinerarySchema().dump(updated_itinerary)), HTTPStatus.OK

    except HTTPException:
        raise
    except PermissionError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity error updating itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.error(f"Error updating itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@itinerary_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def delete_itinerary(id: str):
    """DELETE /api/itinerary/<id> - Delete itinerary by ID"""
    try:
        logger.info(f"Deleting itinerary {id}")
        ItineraryService.delete_itinerary(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
        
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Itinerary with id {id} not found")
    except IntegrityError as e:
        logger.error(f"Integrity error deleting itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Cannot delete itinerary due to existing references")
    except Exception as e:
        logger.error(f"Error deleting itinerary: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
