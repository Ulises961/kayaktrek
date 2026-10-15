import logging
from http import HTTPStatus
from uuid import UUID

from flask import Blueprint, abort, g, jsonify, request
from flask.typing import ResponseReturnValue
from marshmallow import ValidationError

from Schemas.satellite_feed_schema import SatelliteFeedSchema
from Services.Middleware.auth_middleware import JWTService
from Services.satellite_feed_service import SatelliteFeedService

logger = logging.getLogger(__name__)

SATELLITE_FEED_ENDPOINT = "/api/v1/satellite-feeds"
satellite_feed_api = Blueprint("satellite_feed", __name__, url_prefix=SATELLITE_FEED_ENDPOINT)


@satellite_feed_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def list_satellite_feeds() -> ResponseReturnValue:
    """
    ---
    get:
      summary: List the caller's registered satellite communicator feeds
      responses:
        200:
          description: The caller's satellite feeds
          content:
            application/json:
              schema:
                type: array
                items: SatelliteFeedSchema
    """
    feeds = SatelliteFeedService.list_for_user(UUID(str(g.current_user_id)))
    return jsonify(SatelliteFeedSchema(many=True).dump(feeds)), HTTPStatus.OK


@satellite_feed_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_satellite_feed() -> ResponseReturnValue:
    """
    ---
    post:
      summary: Register a satellite communicator feed (Garmin inReach MapShare for M29)
      requestBody:
        content:
          application/json:
            schema: SatelliteFeedSchema
      responses:
        201:
          description: Feed registered
          content:
            application/json:
              schema: SatelliteFeedSchema
        409:
          description: A feed for this provider is already registered
    """
    try:
        data = SatelliteFeedSchema().load(request.get_json() or {})
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e.messages))

    try:
        feed = SatelliteFeedService.create(UUID(str(g.current_user_id)), data)
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))

    return jsonify(SatelliteFeedSchema().dump(feed)), HTTPStatus.CREATED


@satellite_feed_api.route("/<uuid:feed_id>", methods=["PATCH"])
@JWTService.authenticate_restful
def update_satellite_feed(feed_id: UUID) -> ResponseReturnValue:
    """
    ---
    patch:
      summary: Update a satellite feed's URL/credentials — also clears needsReauth
      responses:
        200:
          description: Feed updated
          content:
            application/json:
              schema: SatelliteFeedSchema
        404:
          description: No such feed for this user
    """
    feed = SatelliteFeedService.get_owned(str(feed_id), UUID(str(g.current_user_id)))
    if feed is None:
        abort(HTTPStatus.NOT_FOUND, description="Satellite feed not found")

    try:
        data = SatelliteFeedSchema(partial=True).load(request.get_json() or {})
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e.messages))

    feed = SatelliteFeedService.update(feed, data)
    return jsonify(SatelliteFeedSchema().dump(feed)), HTTPStatus.OK


@satellite_feed_api.route("/<uuid:feed_id>", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_satellite_feed(feed_id: UUID) -> ResponseReturnValue:
    """
    ---
    delete:
      summary: Remove a registered satellite feed
      responses:
        200:
          description: Feed removed
        404:
          description: No such feed for this user
    """
    feed = SatelliteFeedService.get_owned(str(feed_id), UUID(str(g.current_user_id)))
    if feed is None:
        abort(HTTPStatus.NOT_FOUND, description="Satellite feed not found")

    SatelliteFeedService.delete(feed)
    return jsonify({"status": "success", "message": "Satellite feed removed"}), HTTPStatus.OK
