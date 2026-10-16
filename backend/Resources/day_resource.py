from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort
from sqlalchemy.exc import IntegrityError, NoResultFound
from marshmallow import ValidationError
from Schemas.day_schema import DaySchema, DayUpdateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.day_service import DayService

logger = logging.getLogger(__name__)

DAY_ENDPOINT = "/api/v1/day"
day_api = Blueprint('day', __name__, url_prefix=DAY_ENDPOINT)

@day_api.route("/itinerary/<string:itinerary_id>", methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day', parent_resource=('itinerary', 'itinerary_id'))
def read_by_itinerary(itinerary_id: str):
    """
    ---
    get:
      summary: List all days of an itinerary
      responses:
        200:
          description: The itinerary's days
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/DaySchema'
    """
    days = DayService.get_by_itinerary(itinerary_id)
    return jsonify([DaySchema().dump(day) for day in days]), HTTPStatus.OK


@day_api.route("/<string:id>", methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def read_by_id(id: str):
    """
    ---
    get:
      summary: Get a day by id
      responses:
        200:
          description: The day
          content:
            application/json:
              schema: DaySchema
        404:
          description: Day not found
    """
    try:
        day = DayService.get_day_by_id(id)
        return jsonify(DaySchema().dump(day)), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))

@day_api.route("/by-key", methods=['POST'])
@JWTService.authenticate_restful
@require_owner('day', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def read_by_key():
    """
    ---
    post:
      summary: Look up a day by its natural key
      description: "Body: { itineraryId, dayNumber, date }."
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [itineraryId, dayNumber, date]
              properties:
                itineraryId:
                  type: string
                dayNumber:
                  type: integer
                date:
                  type: string
                  format: date
      responses:
        200:
          description: The matching day
          content:
            application/json:
              schema: DaySchema
        400:
          description: Missing or incomplete day key
    """
    body = request.get_json()

    if not body or not body.get("itineraryId") or not body.get("dayNumber") or not body.get("date"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing or incomplete day key")

    day = DayService.get_by_key_from_dict(body)
    return jsonify(DaySchema().dump(day)), HTTPStatus.OK


@day_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('day', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def create_day():
    """POST /api/day - Create new day
    ---
    post:
      summary: Create a day
      requestBody:
        content:
          application/json:
            schema: DaySchema
      responses:
        201:
          description: The created day
          content:
            application/json:
              schema: DaySchema
        400:
          description: Invalid day data
        409:
          description: Database integrity constraint violated
    """
    try:
        body = request.get_json()
        if not isinstance(body, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        day = DaySchema().load(body)
        created_day = DayService.create_day(day)
        return jsonify(DaySchema().dump(created_day)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity error creating day: {e}")
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@day_api.route("/<string:id>", methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('day')
def update_day(id: str):
    """
    PATCH /api/day/<id> — Partially update an existing day.

    Accepts a JSON body with any subset of day fields (dayNumber, date, points).
    Only the fields present in the body are applied; omitted fields are left unchanged.

    Returns:
        200 with the updated day object, or 404 if not found.
    ---
    patch:
      summary: Partially update a day
      requestBody:
        content:
          application/json:
            schema: DayUpdateSchema
      responses:
        200:
          description: The updated day
          content:
            application/json:
              schema: DaySchema
        400:
          description: Invalid field values
        404:
          description: Day not found
        409:
          description: Database integrity constraint violated
    """
    try:
        raw = request.get_json()
        validated = DayUpdateSchema().load(raw)
        day_data = {**raw, **validated}
        updated_day = DayService.update_day(id, day_data)
        return jsonify(DaySchema().dump(updated_day)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity error updating day: {e}")
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@day_api.route("/<string:id>/assign", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('day')
def assign_points(id: str):
    """POST /api/day/<id>/assign — Assign a range of points to this day.

    Body: { startPointId: uuid, endPointId: uuid }
    Walks the linked list from startPointId to endPointId and sets each
    point's day_id to this day's id.
    ---
    post:
      summary: Assign a range of route points to this day
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [startPointId, endPointId]
              properties:
                startPointId:
                  type: string
                endPointId:
                  type: string
      responses:
        200:
          description: Assignment confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        400:
          description: startPointId/endPointId missing, a cycle was detected, or endPointId is not reachable from startPointId
        404:
          description: Day or start point not found
    """
    try:
        body = request.get_json()
        if not body or not body.get("startPointId") or not body.get("endPointId"):
            abort(HTTPStatus.BAD_REQUEST, description="startPointId and endPointId are required")
        DayService.assign_points(id, body["startPointId"], body["endPointId"])
        return jsonify({"message": "Points assigned"}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@day_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('day')
def delete_day_by_id(id: str):
    """DELETE /api/day/<id> - Delete day by ID
    ---
    delete:
      summary: Delete a day
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
          description: Day not found
        409:
          description: Cannot delete day due to existing references
    """
    try:
        DayService.delete_day(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except IntegrityError as e:
        logger.error(f"Integrity error deleting day: {e}")
        abort(HTTPStatus.CONFLICT, description="Cannot delete day due to existing references")