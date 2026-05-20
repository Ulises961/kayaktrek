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

POINT_ENDPOINT = "/api/point"
point_api = Blueprint('point', __name__, url_prefix=POINT_ENDPOINT)


# TODO: POI points need to run as a separate microservice that can be cached and served
# TODO: When a PoI is created it is shared to RabbitMQ and saved into the db
# TODO: Check permissions to create or modify points from parent entity itinerary
@point_api.route("/pois", methods=["GET"])
@JWTService.authenticate_restful
def get_poi():
    """
    PointResource GET method. Retrieves point(s) of interest.

    Returns:
        JSON response with point data and 200 status code
    """
    try:
        range_km: float = request.args.get('range', 0.0, type=float)
        longitude: float = request.args.get('long', 0.0, type=float)
        latitude: float = request.args.get('lat', 0.0, type=float)
        results = PointService.get_points_in_range(range_km, longitude, latitude)

        schema = PointSchema()
        return jsonify([
            {**schema.dump(r['point']), 'distanceKm': r['distance_km']}  # type: ignore[arg-type]
            for r in results
        ])
    except Exception as e:
        logger.error(f"Error retrieving POIs: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


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
        point_data = {**raw, **validated}  # type: ignore[arg-type]
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
