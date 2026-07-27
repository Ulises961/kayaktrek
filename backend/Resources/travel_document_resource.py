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
    """
    ---
    get:
      summary: List a trip's travel documents
      description: >
        Ordered by governing date (document date, falling back to expiry date,
        nulls last).
      responses:
        200:
          description: The trip's travel documents
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/TravelDocumentSchema'
    """
    docs = TravelDocumentService.list_for_trip(trip_id)
    return jsonify(TravelDocumentSchema(many=True).dump(docs)), HTTPStatus.OK


@travel_document_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_document(trip_id: str):
    """
    ---
    post:
      summary: Create a travel document for a trip
      description: Any trip member may create one; the creator becomes its owner.
      requestBody:
        content:
          application/json:
            schema: TravelDocumentSchema
      responses:
        201:
          description: The created travel document
          content:
            application/json:
              schema: TravelDocumentSchema
        404:
          description: Trip not found
        422:
          description: Validation error (e.g. missing name, or expiry date before document date)
    """
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
    """
    ---
    patch:
      summary: Partially update a travel document
      description: >
        Only the document's owner or the trip leader may update it, and only
        while it is still within its editable window (governing date not yet
        passed, and the trip is not past/archived once undated).
      requestBody:
        content:
          application/json:
            schema: TravelDocumentSchema
      responses:
        200:
          description: The updated travel document
          content:
            application/json:
              schema: TravelDocumentSchema
        403:
          description: Caller is neither the document owner nor the trip leader, or the document is no longer editable
        404:
          description: Document not found
        422:
          description: Validation error (e.g. expiry date before document date)
    """
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
    """
    ---
    delete:
      summary: Delete a travel document
      description: >
        Only the document's owner or the trip leader may delete it, and only
        while it is still within its editable window. Removes the MinIO
        attachment first if one exists.
      responses:
        204:
          description: Document deleted
        403:
          description: Caller is neither the document owner nor the trip leader, or the document is no longer editable
        404:
          description: Document not found
    """
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
    """
    ---
    post:
      summary: Upload or replace a travel document's file attachment
      description: >
        Multipart upload, field name 'file'. If a previous attachment exists
        it is deleted from MinIO first. Only the document's owner or the trip
        leader may upload, and only while it is still within its editable window.
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
      responses:
        200:
          description: The travel document with its new attachment path
          content:
            application/json:
              schema: TravelDocumentSchema
        400:
          description: No file provided, file has no name, or the file fails MIME/size validation
        403:
          description: Caller is neither the document owner nor the trip leader, or the document is no longer editable
        404:
          description: Document not found
    """
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
    """
    ---
    delete:
      summary: Remove a travel document's file attachment
      description: >
        Only the document's owner or the trip leader may delete it, and only
        while it is still within its editable window.
      responses:
        200:
          description: The travel document with its attachment removed
          content:
            application/json:
              schema: TravelDocumentSchema
        403:
          description: Caller is neither the document owner nor the trip leader, or the document is no longer editable
        404:
          description: Document not found, or has no attachment
    """
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
    """
    ---
    get:
      summary: Get a presigned download URL for a travel document's attachment
      description: URL expires after 15 minutes.
      responses:
        200:
          description: The presigned URL
          content:
            application/json:
              schema:
                type: object
                properties:
                  url:
                    type: string
        404:
          description: Document not found, or has no attachment
    """
    try:
        url = TravelDocumentService.get_attachment_url(id, g.current_user_id)
        return jsonify({"url": url}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("travel_document_attachment_url_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
