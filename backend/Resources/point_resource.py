from http import HTTPStatus
import logging
from sqlalchemy.exc import IntegrityError, NoResultFound
from flask import Blueprint, abort, g, jsonify, request
from marshmallow import ValidationError
from Schemas.point_schema import PointSchema, PointUpdateSchema
from Schemas.image_schema import ImageSchema, ImageUpdateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.point_service import PointService
from Services.image_service import ImageService
from Services.storage_service import StorageValidationError
from Api.database import db
from Api.limiter import limiter

logger = logging.getLogger(__name__)

POINT_ENDPOINT = "/api/v1/point"
point_api = Blueprint('point', __name__, url_prefix=POINT_ENDPOINT)


# Points are route points only. Points of interest are standalone Place entities,
# queried by proximity through the place API (GET /api/place/by-itinerary/<id>/range).
@point_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
@limiter.limit("1000 per hour", key_func=lambda: str(g.current_user_id))
@require_owner("point", parent_resource=("day", "dayId"), from_body=True)
def create_point():
    """
    PointResource POST method. Adds a new point to the database.

    Returns:
        JSON response with created point and 201 status code
    ---
    post:
      summary: Add a route point to a day
      description: >
        Appended to the tail of the itinerary-wide point chain (linked via
        `next_id`), not just the day's own points. Pass `afterPointId` to splice
        the new point in directly after an existing one instead — a point dropped
        on a leg belongs between the two it was dropped between. The predecessor
        must belong to the same itinerary.
      requestBody:
        content:
          application/json:
            schema: PointSchema
      responses:
        201:
          description: The created point
          content:
            application/json:
              schema: PointSchema
        400:
          description: Invalid point data, or the itinerary belongs to a completed trip
        409:
          description: Database integrity constraint violated
    """
    try:
        point_data = request.get_json()
        point = PointService.create_point(point_data)
        return jsonify(PointSchema().dump(point)), HTTPStatus.CREATED

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity Error creating point: {e}")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")


@point_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@limiter.limit("1000 per hour", key_func=lambda: str(g.current_user_id))
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
    ---
    patch:
      summary: Partially update a route point
      requestBody:
        content:
          application/json:
            schema: PointUpdateSchema
      responses:
        200:
          description: The updated point
          content:
            application/json:
              schema: PointSchema
        400:
          description: Invalid field values
        404:
          description: Point not found
    """
    try:
        raw = request.get_json()
        validated = PointUpdateSchema().load(raw)
        point_data = {**raw, **validated}
        point = PointService.update_point(id, point_data)
        return jsonify(PointSchema().dump(point)), HTTPStatus.OK

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")


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
    ---
    get:
      summary: Get a route point by id
      responses:
        200:
          description: The point
          content:
            application/json:
              schema: PointSchema
        404:
          description: Point not found
    """
    try:
        point = PointService.get_point_by_id(id)
        return jsonify(PointSchema().dump(point)), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")


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
    ---
    delete:
      summary: Delete a route point
      description: >
        The predecessor's `next_id` is healed to the deleted point's `next_id`
        before deletion, so the route chain stays intact.
      responses:
        200:
          description: Deletion confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Point not found
    """
    try:
        logger.info(f"Deleting point {id}")
        PointService.delete_point(id)
        return {"message": "Deletion successful"}, 200
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Point with id {id} not found")


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
    ---
    post:
      summary: Upload an image and attach it to a point
      description: Multipart upload, field name 'file'.
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
        201:
          description: The created image
          content:
            application/json:
              schema: ImageSchema
        400:
          description: No file provided, file has no name, or the file fails MIME/size validation
        404:
          description: Point not found
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


@point_api.route("/<string:id>/images/<string:image_id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("point")
def update_image(id: str, image_id: str):
    """
    PATCH /api/point/<id>/images/<image_id> — update an image's visibility, its
    caption, or both. Only the fields present in the body are applied.

    Body: { "isPublic"?: bool, "caption"?: str | null }

    Args:
        id: Point ID the image is attached to
        image_id: Image ID to update

    Returns:
        200 with the updated image object

    Raises:
        400: If neither field is present, isPublic is not a boolean, or the caption
             fails validation
        404: If the image does not exist
    ---
    patch:
      summary: Update an image's visibility and/or caption
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                isPublic:
                  type: boolean
                caption:
                  type: string
                  nullable: true
      responses:
        200:
          description: The updated image
          content:
            application/json:
              schema: ImageSchema
        400:
          description: Neither field present, isPublic not a boolean, or caption too long
        404:
          description: Image not found
    """
    body = request.get_json() or {}
    has_visibility = "isPublic" in body
    has_caption = "caption" in body
    if not (has_visibility or has_caption):
        abort(HTTPStatus.BAD_REQUEST, description="Provide isPublic or caption")
    if has_visibility and not isinstance(body["isPublic"], bool):
        abort(HTTPStatus.BAD_REQUEST, description="isPublic must be a boolean")

    try:
        image = ImageService.get_image_by_id(image_id)
        if has_caption:
            validated = ImageUpdateSchema().load({"caption": body["caption"]})
            image = ImageService.set_caption(image_id, validated.get("caption"))
        if has_visibility:
            image = ImageService.set_public(image_id, body["isPublic"])
        return jsonify(ImageSchema().dump(image)), HTTPStatus.OK

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e.messages))

    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


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
    ---
    delete:
      summary: Delete an image from a point
      responses:
        204:
          description: Image deleted
        404:
          description: Point or image not found
    """
    try:
        ImageService.delete_from_point(image_id, id)
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
