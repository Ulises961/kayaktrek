from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError, NoResultFound
from flask import Blueprint, abort, jsonify, request
from marshmallow import ValidationError
from Schemas.point_schema import PointSchema, PointUpdateSchema
from Schemas.image_schema import ImageSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.point_service import PointService
from Services.image_service import ImageService
from Services.storage_service import StorageValidationError
from Api.database import db

logger = logging.getLogger(__name__)

POINT_ENDPOINT = "/api/v1/point"
point_api = Blueprint('point', __name__, url_prefix=POINT_ENDPOINT)


# Points of interest are no longer route points — they are standalone Place
# entities, queried by proximity through the place API (GET /api/place/by-itinerary/
# <id>/range). The old GET /api/point/pois range query was removed with the
# `interest` PointType in M4e §1.
@point_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("point", parent_resource=("day", "dayId"), from_body=True)
def create_point():
    """
    PointResource POST method. Adds a new point to the database.

    Returns:
        JSON response with created point and 201 status code
    """
    try:
        point_data = request.get_json()
        point = PointService.create_point(point_data)
        return jsonify(PointSchema().dump(point)), HTTPStatus.CREATED

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity Error creating point: {e}")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, message="Database integrity violated")
    except Exception as e:
        logger.error(f"Error creating point: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("point")
def update_point(id: str):
    """
    PATCH /api/point/<id> — Partially update an existing point.

    Accepts a JSON body with any subset of mutable point fields
    (name, latitude, longitude, type, etc.).
    Only the fields present in the body are applied; omitted fields are left unchanged.
    The geo column is kept in sync with any updated latitude/longitude values.

    Returns:
        200 with the updated point object, or 404 if not found.
    """
    try:
        raw = request.get_json()
        validated = PointUpdateSchema().load(raw)
        point_data = {**raw, **validated}
        point = PointService.update_point(id, point_data)
        return jsonify(PointSchema().dump(point)), HTTPStatus.OK

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")
    except Exception as e:
        logger.error(f"Error updating point: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("point")
def get_point(id: str):
    """
    PointResource GET method. Retrieves a single point by ID.

    Args:
        id: Point ID to retrieve

    Returns:
        JSON response with point data and 200 status code
    """
    try:
        point = PointService.get_point_by_id(id)
        return jsonify(PointSchema().dump(point)), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")
    except Exception as e:
        logger.error(f"Error retrieving point: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("point")
def delete(id: str):
    """
    PointResource DELETE method. Deletes a point by ID.

    Args:
        id: Point ID to delete

    Returns:
        Success message and 200 status code
    """
    try:
        logger.info(f"Deleting point {id}")
        PointService.delete_point(id)
        return {"message": "Deletion successful"}, 200

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, message=f"Point with id {id} not found")
    except Exception as e:
        logger.error(f"Error deleting point: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>/images", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("point")
def upload_image(id: str):
    """
    Upload an image and attach it to a point.

    Args:
        id: Point ID to attach the image to

    Returns:
        JSON response with the created image and 201 status code

    Raises:
        400: If no file is provided or the file fails validation
        404: If the point does not exist
    """
    if "file" not in request.files:
        abort(HTTPStatus.BAD_REQUEST, description="No file provided")

    file = request.files["file"]
    if not file.filename:
        abort(HTTPStatus.BAD_REQUEST, description="File has no name")

    try:
        file_bytes = file.read()
        image = ImageService.upload_for_point(id, file_bytes, file.filename)
        return jsonify(ImageSchema().dump(image)), HTTPStatus.CREATED

    except StorageValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")
    except Exception as e:
        logger.error("Error uploading image for point %s: %s", id, e)
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>/images/<string:image_id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("point")
def update_image_visibility(id: str, image_id: str):
    """
    PATCH /api/point/<id>/images/<image_id> — toggle an image's public/private visibility.

    Body: { "isPublic": bool }

    Args:
        id: Point ID the image is attached to
        image_id: Image ID to update

    Returns:
        200 with the updated image object

    Raises:
        400: If isPublic is missing or not a boolean
        404: If the image does not exist
    """
    body = request.get_json() or {}
    is_public = body.get("isPublic")
    if not isinstance(is_public, bool):
        abort(HTTPStatus.BAD_REQUEST, description="isPublic must be a boolean")

    try:
        image = ImageService.set_public(image_id, is_public)
        return jsonify(ImageSchema().dump(image)), HTTPStatus.OK

    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("Error updating visibility for image %s: %s", image_id, e)
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@point_api.route("/<string:id>/images/<string:image_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("point")
def delete_image(id: str, image_id: str):
    """
    Detach and permanently delete an image from a point.

    Args:
        id: Point ID the image is attached to
        image_id: Image ID to delete

    Returns:
        204 No Content on success

    Raises:
        404: If the point or image does not exist
    """
    try:
        ImageService.delete_from_point(image_id, id)
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("Error deleting image %s from point %s: %s", image_id, id, e)
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
