from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError
from uuid import UUID
from sqlalchemy.exc import NoResultFound
from flask import Blueprint, abort, g, jsonify, request
from marshmallow import ValidationError
from Schemas.trip_schema import TripSchema, TripUpdateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner, require_leader
from Services.trip_service import TripService

logger = logging.getLogger(__name__)

TRIP_ENDPOINT = "/api/trip"
## TODO: Trip creation needs a separate microservice different from trip execution to avoid bogging down service through trip creation
## TODO: A trip created is published in Kafka and then stored in db
trip_api = Blueprint("trip", __name__, url_prefix=TRIP_ENDPOINT)


@trip_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip")
def get_trip(id: str):
    """
    TripResource GET method. Retrieves trip by id.

    Returns:
        JSON response with trip data and 200 status code
    """
    try:
        logger.info(f"Retrieving trip with id {id}")
        trip = TripService.get_trip_by_id(id)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:user_id>/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_user_trips(user_id: str):
    """
    TripResource GET method. Retrieves trip(s) by ID or all trips.

    Returns:
        JSON response with trip data and 200 status code
    """
    if str(g.current_user_id) != user_id:
        abort(HTTPStatus.FORBIDDEN, description="Access denied")
    try:
        logger.info(f"Retrieving all trips for user with id {user_id}")
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        result = TripService.get_trips_by_user(user_id, page=page, per_page=per_page)
        schema = TripSchema()
        return jsonify({
            "items": [schema.dump(trip) for trip in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "pages": result["pages"],
        }), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:user_id>/invitations", methods=["GET"])
@JWTService.authenticate_restful
def get_all_user_invitations(user_id: str):
    """
    TripResource GET method. Retrieves trip(s) by ID or all trips.

    Returns:
        JSON response with trip data and 200 status code
    """
    if str(g.current_user_id) != user_id:
        abort(HTTPStatus.FORBIDDEN, description="Access denied")
    try:
        logger.info(f"Retrieving trip with id {id}")
        trips = TripService.get_invitations_by_user(user_id)
        return jsonify([TripSchema().dump(trip) for trip in trips]), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def post():
    """
    TripResource POST method. Adds a new trip to the database.

    Returns:
        JSON response with created trip and 201 status code
    """
    try:
        trip_data = request.get_json()
        trip = TripService.create_trip(trip_data)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.CREATED
    except HTTPException:
        raise
    except IntegrityError as e:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.exception(f"Error creating trip: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@trip_api.route("/<string:id>/state", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def transition_state(id: str):
    """
    Transition a trip's state forward (draft → planning → happening → past).

    Returns:
        JSON response with updated trip and 200 status code
    """
    try:
        body = request.get_json()
        new_state = body.get("state") if body else None
        if not new_state:
            abort(HTTPStatus.BAD_REQUEST, description="'state' field is required")
        trip = TripService.transition_trip_state(id, new_state)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("trip")
def update_trip(id: str):
    """
    PATCH /api/trip/<id> — Partially update an existing trip.

    Accepts a JSON body with any subset of mutable trip fields
    (destination, description, dateFrom, dateTo).
    Only the fields present in the body are applied; omitted fields are left unchanged.
    State transitions must go through POST /api/trip/<id>/state instead.

    Returns:
        200 with the updated trip object, or 404 if not found.
    """
    try:
        raw = request.get_json()
        validated = TripUpdateSchema().load(raw)
        assert isinstance(validated, dict)
        trip_data = {**raw, **validated}
        trip = TripService.update_trip(id, trip_data)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@trip_api.route("/<string:id>/invite", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def invite_user(id: str):
    """
    POST /api/trip/<id>/invite — Leader invites a user to the trip.

    Body: {"userId": "<uuid>"}
    Returns 201 with the invitation, 404 if trip/user not found, 409 if already invited or member.
    """
    try:
        body = request.get_json()
        invitee_id = body.get("userId") if body else None
        if not invitee_id:
            abort(HTTPStatus.BAD_REQUEST, description="'userId' field is required")
        TripService.invite_user(id, invitee_id)
        return jsonify({"message": "Invitation sent"}), HTTPStatus.CREATED
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/invite/<string:invitee_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def cancel_invitation(id: str, invitee_id: str):
    """
    DELETE /api/trip/<id>/invite/<invitee_id> — Leader cancels a pending invitation.

    Returns 200 on success, 404 if no pending invitation exists.
    """
    try:
        TripService.cancel_invitation(id, invitee_id)
        return jsonify({"message": "Invitation cancelled"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/invitation", methods=["POST"])
@JWTService.authenticate_restful
def handle_invitation(id: str):
    """
    POST /api/trip/<id>/invitation — Current user accepts or declines their invitation.

    Body: {"accepted": true | false}
    Returns 200 on success, 404 if no valid invitation found.
    """
    try:
        body = request.get_json()
        if body is None or "accepted" not in body:
            abort(HTTPStatus.BAD_REQUEST, description="'accepted' field is required")
        TripService.handle_invitation(id, bool(body["accepted"]))
        action = "accepted" if body["accepted"] else "declined"
        return jsonify({"message": f"Invitation {action}"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/<string:user_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def remove_member(id: str, user_id: str):
    """
    DELETE /api/trip/<id>/member/<user_id> — Leader removes a crew member from the trip.

    Returns 200 on success, 404 if user is not a member, 409 if target is the leader.
    """
    try:
        TripService.remove_member(id, user_id)
        return jsonify({"message": "Member removed"}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
def delete(id: str):
    """
    TripResource DELETE method. Deletes a trip by id.

    Returns:
        Success message and 200 status code
    """
    try:
        delete_to_all_participants = request.args.get("for_everyone", "false").lower() == "true"
        
        logger.info(f"Deleting trip {id}")
        TripService.delete_trip(id, delete_to_all_participants)
        return {"message": "Deletion successful"}, HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

