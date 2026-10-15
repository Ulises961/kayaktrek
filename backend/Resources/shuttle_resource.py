from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from flask.typing import ResponseReturnValue
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.shuttle_vehicle_schema import ShuttleVehicleSchema
from Schemas.shuttle_passenger_schema import ShuttlePassengerSchema
from Services.shuttle_service import ShuttleService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

SHUTTLE_ENDPOINT = "/api/v1/shuttle"
shuttle_api = Blueprint("shuttle", __name__, url_prefix=SHUTTLE_ENDPOINT)


@shuttle_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_vehicles(trip_id: str) -> ResponseReturnValue:
    """
    List all shuttle vehicles arranged for a trip.
    ---
    get:
      summary: List a trip's shuttle vehicles
      responses:
        200:
          description: The trip's shuttle vehicles
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/ShuttleVehicleSchema'
    """
    vehicles = ShuttleService.list_for_trip(trip_id)
    return jsonify(ShuttleVehicleSchema(many=True).dump(vehicles)), HTTPStatus.OK


@shuttle_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_vehicle(trip_id: str) -> ResponseReturnValue:
    """
    Arrange a shuttle vehicle for a trip. The calling member becomes the arranger.
    ---
    post:
      summary: Create a shuttle vehicle for a trip
      requestBody:
        content:
          application/json:
            schema: ShuttleVehicleSchema
      responses:
        201:
          description: The created shuttle vehicle
          content:
            application/json:
              schema: ShuttleVehicleSchema
        400:
          description: Trip is past or archived and can no longer be edited
        404:
          description: Trip not found, or caller is not a member of the trip
        422:
          description: Invalid vehicle data
    """
    try:
        vehicle = ShuttleService.create_vehicle(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleVehicleSchema().dump(vehicle)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def update_vehicle(vehicle_id: str) -> ResponseReturnValue:
    """
    Partially update a shuttle vehicle. Only the arranger or trip leader may update.
    ---
    patch:
      summary: Update a shuttle vehicle
      description: >
        Accepts any subset of driverId, driverName, driverContact, seatsAvailable,
        kayakSpots, vehicleDescription, pickupPoint. Omitted fields are left unchanged.
      requestBody:
        content:
          application/json:
            schema: ShuttleVehicleSchema
      responses:
        200:
          description: The updated shuttle vehicle
          content:
            application/json:
              schema: ShuttleVehicleSchema
        403:
          description: Trip is past/archived, or caller is neither arranger nor leader
        404:
          description: Vehicle not found
        422:
          description: Invalid vehicle data
    """
    try:
        vehicle = ShuttleService.update_vehicle(vehicle_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleVehicleSchema().dump(vehicle)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)


@shuttle_api.route("/vehicle/<vehicle_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def delete_vehicle(vehicle_id: str) -> ResponseReturnValue:
    """
    Delete a shuttle vehicle and all its passengers. Only the arranger or trip leader may delete.
    ---
    delete:
      summary: Delete a shuttle vehicle
      responses:
        204:
          description: Vehicle deleted
        403:
          description: Trip is past/archived, or caller is neither arranger nor leader
        404:
          description: Vehicle not found
    """
    try:
        ShuttleService.delete_vehicle(vehicle_id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>/passenger", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def add_passenger(vehicle_id: str) -> ResponseReturnValue:
    """
    Add a trip member as a passenger in a shuttle vehicle.

    Any trip member may add themselves; the arranger or trip leader may add anyone.
    ---
    post:
      summary: Add a passenger to a shuttle vehicle
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - tripMemberId
              properties:
                tripMemberId:
                  type: string
                  format: uuid
      responses:
        201:
          description: The created passenger assignment
          content:
            application/json:
              schema: ShuttlePassengerSchema
        400:
          description: tripMemberId is missing, trip is past/archived, or member already assigned to this vehicle
        403:
          description: Crew member trying to add someone other than themselves
        404:
          description: Vehicle or trip member not found
    """
    data = request.get_json(silent=True) or {}
    member_id = data.get("tripMemberId")
    if not member_id:
        abort(HTTPStatus.BAD_REQUEST, description="tripMemberId is required")
    try:
        passenger = ShuttleService.add_passenger(vehicle_id, member_id, g.current_user_id)
        return jsonify(ShuttlePassengerSchema().dump(passenger)), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>/passenger/<member_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def remove_passenger(vehicle_id: str, member_id: str) -> ResponseReturnValue:
    """
    Remove a passenger from a shuttle vehicle.

    Any trip member may remove themselves; the arranger or trip leader may remove anyone.
    ---
    delete:
      summary: Remove a passenger from a shuttle vehicle
      responses:
        204:
          description: Passenger removed
        403:
          description: Trip is past/archived, or crew member trying to remove someone other than themselves
        404:
          description: Vehicle not found, or member is not a passenger in this vehicle
    """
    try:
        ShuttleService.remove_passenger(vehicle_id, member_id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
