from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.document_schema import DocumentSchema
from Services.document_service import DocumentService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

DOCUMENT_ENDPOINT = "/api/document"
document_api = Blueprint("document", __name__, url_prefix=DOCUMENT_ENDPOINT)


@document_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_documents(trip_id: str):
    documents = DocumentService.list_for_trip(trip_id)
    return jsonify(DocumentSchema(many=True).dump(documents)), HTTPStatus.OK


@document_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_document(trip_id: str):
    try:
        document = DocumentService.create(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(DocumentSchema().dump(document)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("document_create_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@document_api.route("/<id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("document")
def update_document(id: str):
    try:
        document = DocumentService.update(id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(DocumentSchema().dump(document)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("document_update_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@document_api.route("/<id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("document")
def delete_document(id: str):
    try:
        DocumentService.delete(id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("document_delete_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
