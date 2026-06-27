from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.travel_document_schema import TravelDocumentSchema
from Services.travel_document_service import TravelDocumentService
from Services.storage_service import StorageValidationError
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Api.database import db

logger = logging.getLogger(__name__)

TRAVEL_DOCUMENT_ENDPOINT = "/api/v1/travel-document"
travel_document_api = Blueprint("travel_document", __name__, url_prefix=TRAVEL_DOCUMENT_ENDPOINT)


@travel_document_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_documents(trip_id: str):
    docs = TravelDocumentService.list_for_trip(trip_id)
    return jsonify(TravelDocumentSchema(many=True).dump(docs)), HTTPStatus.OK


@travel_document_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_document(trip_id: str):
    try:
        doc = TravelDocumentService.create(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(TravelDocumentSchema().dump(doc)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_create_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@travel_document_api.route("/<id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("travel_document")
def update_document(id: str):
    try:
        doc = TravelDocumentService.update(id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(TravelDocumentSchema().dump(doc)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("travel_document_update_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@travel_document_api.route("/<id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("travel_document")
def delete_document(id: str):
    try:
        TravelDocumentService.delete(id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_delete_error", extra={"error": str(e)})
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@travel_document_api.route("/<id>/attachment", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("travel_document")
def upload_attachment(id: str):
    if "file" not in request.files:
        abort(HTTPStatus.BAD_REQUEST, description="No file provided")
    file = request.files["file"]
    if not file.filename:
        abort(HTTPStatus.BAD_REQUEST, description="File has no name")
    try:
        doc = TravelDocumentService.upload_attachment(id, file.read(), file.filename, g.current_user_id)
        return jsonify(TravelDocumentSchema().dump(doc)), HTTPStatus.OK
    except StorageValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_upload_error", extra={"error": str(e)})
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@travel_document_api.route("/<id>/attachment", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("travel_document")
def delete_attachment(id: str):
    try:
        doc = TravelDocumentService.delete_attachment(id, g.current_user_id)
        return jsonify(TravelDocumentSchema().dump(doc)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_delete_attachment_error", extra={"error": str(e)})
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@travel_document_api.route("/<id>/attachment", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("travel_document")
def get_attachment_url(id: str):
    try:
        url = TravelDocumentService.get_attachment_url(id, g.current_user_id)
        return jsonify({"url": url}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_attachment_url_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
