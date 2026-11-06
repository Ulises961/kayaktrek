import os
from datetime import date
from http import HTTPStatus
from typing import Optional

from flask import Blueprint, Response, abort, current_app, g, jsonify, request, stream_with_context
from flask.typing import ResponseReturnValue
from flask_limiter.util import get_remote_address
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Api.limiter import limiter
from Schemas.position_ping_schema import PositionPingSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner, require_leader, _check_trip_ownership
from Services.expedition_log_service import ExpeditionLogService
from Services.itinerary_service import ItineraryService
from Services.live_position_service import LivePositionService
from Services.live_stream_service import LiveStreamService
from Services.trip_change_service import TripChangeService
from Services.trip_service import TripService
from Tasks.expedition_log_task import generate_trip_day_logs

logger = logging.getLogger(__name__)

LIVE_ENDPOINT = "/api/v1/live"
live_api = Blueprint("live", __name__, url_prefix=LIVE_ENDPOINT)

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

# What a client is told to wait when the change log cannot be read. Longer than the poll
# interval: an unreachable Redis is not helped by everyone retrying every few seconds.
_CHANGES_RETRY_AFTER_SECONDS = "30"

# Per-IP, since a stream can arrive with no resolved user yet (the ticket path).
# Configurable because two browser contexts sharing one dev/CI machine's IP hit it within
# a normal test run and then wait out ~90s of client-side backoff
# (frontend/hooks/use-live-positions.ts); real crews sharing one NAT/WiFi IP can hit it
# too. Production keeps the conservative default.
_LIVE_STREAM_RATE_LIMIT = os.getenv("LIVE_STREAM_RATE_LIMIT", "10 per minute")

# The change poll's limit. A visible trip page polls every ~7 s, about nine requests a minute,
# and someone with a few trips open is a few times that; this blocks a runaway loop, not a
# person. Keyed on the user, never the address: the droplet's nginx does not restore the
# visitor's IP from Cloudflare, so an address key could be one key for every visitor.
_CHANGES_POLL_RATE_LIMIT = os.getenv("TRIP_CHANGES_POLL_RATE_LIMIT", "120 per minute")


@live_api.after_request
def _add_cors_headers(response: Response) -> Response:
    """The browser's EventSource connects to this blueprint's routes directly —
    the public story stream (main backend) and the ticketed crew stream (SSE
    sidecar) are both genuinely cross-origin from the Next.js origin, unlike
    every other endpoint in this app (server actions only). Applies to every
    response, including the no-oracle 404s: a missing CORS header on those makes
    the browser report a CORS failure instead of a clean non-200 EventSource
    error, masking the real signal."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
    response.headers["Access-Control-Allow-Origin"] = frontend_url
    return response


@live_api.route("/trip/<string:id>/position", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@limiter.limit("12 per minute")
def post_position(id: str) -> ResponseReturnValue:
    """
    Record a GPS position ping for a happening trip.

    Persists the ping and publishes it to the trip's live SSE channel. Accepted
    while the trip is paused — a paused crew relocating to shelter is exactly
    when shore wants positions.
    ---
    post:
      summary: Record a GPS position ping
      description: >
        Persists the ping and publishes it to the trip's live SSE channel. Accepted
        while the trip is paused.
      requestBody:
        content:
          application/json:
            schema: PositionPingSchema
      responses:
        201:
          description: The recorded ping
          content:
            application/json:
              schema: PositionPingSchema
        400:
          description: Validation error (invalid lat/lon/accuracy/heading/speed)
        409:
          description: The trip must be happening to share a position
    """
    try:
        data = PositionPingSchema().load(request.get_json() or {})
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)

    try:
        ping = LivePositionService.record_ping(id, str(g.current_user_id), data)
    except ValueError as e:
        if str(e) == "trip_not_live":
            abort(HTTPStatus.CONFLICT, description="The trip must be happening to share a position.")
        raise

    return jsonify(PositionPingSchema().dump(ping)), HTTPStatus.CREATED


_CLOSE_DAY_ERROR_MESSAGES = {
    "trip_not_happening": "The trip must be happening to close a day.",
    "no_day_for_date": "There's no itinerary day scheduled for that date.",
}


@live_api.route("/trip/<string:id>/close-day", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def close_day(id: str) -> ResponseReturnValue:
    """
    Close out a happening trip's day and trigger expedition-log generation.

    Leader-only. Validates the day can be closed, then dispatches the
    generate_trip_day_logs Celery task asynchronously — the log itself is
    generated out-of-band.
    ---
    post:
      summary: Close a trip day and generate its expedition log
      description: Leader-only. Dispatches log generation asynchronously; the response returns a task id, not the log itself.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                date:
                  type: string
                  format: date
                  description: ISO 8601 date to close. Defaults to the trip's current local day.
      responses:
        202:
          description: Log generation task accepted
          content:
            application/json:
              schema:
                type: object
                properties:
                  taskId:
                    type: string
                  date:
                    type: string
                    format: date
        400:
          description: "'date' is not a valid ISO 8601 date"
        409:
          description: The trip isn't happening, or has no itinerary day scheduled for that date
    """
    body = request.get_json(silent=True) or {}
    date_str = body.get("date")
    day_date: Optional[date] = None
    if date_str:
        try:
            day_date = date.fromisoformat(date_str)
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="'date' must be an ISO 8601 date (YYYY-MM-DD).")

    try:
        resolved_date = ExpeditionLogService.close_day(id, day_date)
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=_CLOSE_DAY_ERROR_MESSAGES.get(str(e), str(e)))

    result = generate_trip_day_logs.delay(id, resolved_date.isoformat(), request_id=g.request_id)
    return jsonify({"taskId": result.id, "date": resolved_date.isoformat()}), HTTPStatus.ACCEPTED


@live_api.route("/story/<string:token>/stream", methods=["GET"])
@limiter.limit(_LIVE_STREAM_RATE_LIMIT, key_func=get_remote_address)
def story_stream(token: str) -> ResponseReturnValue:
    """Public, unauthenticated live layer on the story share link. 404 no-oracle:
    unknown token, tokenless/standalone itinerary, no trip, or trip not happening are
    all indistinguishable — EventSource treats any non-200 as terminal, so this is
    also the correct signal once the trip finishes and the frontend should stop
    reconnecting.
    ---
    get:
      summary: Public live position stream for a story share link
      description: >
        Server-Sent Events. One `snapshot` event with the current positions, then a
        `position` event per broadcast update, or a `: hb` heartbeat comment every 15s.
      responses:
        200:
          description: SSE stream
          content:
            text/event-stream: {}
        404:
          description: Unknown token, or the trip isn't currently happening
    """
    try:
        itinerary = ItineraryService.get_story_by_token(token)
    except NoResultFound:
        return Response(status=HTTPStatus.NOT_FOUND)

    if itinerary.trip_id is None:
        return Response(status=HTTPStatus.NOT_FOUND)

    trip = TripService.find_happening_trip(str(itinerary.trip_id))
    if trip is None:
        return Response(status=HTTPStatus.NOT_FOUND)

    return Response(
        stream_with_context(LiveStreamService.stream_events(str(trip.id))),
        mimetype="text/event-stream",
        headers=_SSE_HEADERS,
    )


@live_api.route("/trip/<string:id>/stream-ticket", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
def post_stream_ticket(id: str) -> ResponseReturnValue:
    """
    ---
    post:
      summary: Mint a short-lived crew-stream ticket
      description: >
        For M9's React Native client, which can't send an Authorization header on an
        EventSource request — the web frontend only ever uses this.
      responses:
        200:
          description: The ticket
          content:
            application/json:
              schema:
                type: object
                properties:
                  ticket:
                    type: string
    """
    return jsonify({"ticket": LiveStreamService.mint_stream_ticket(id)}), HTTPStatus.OK


@live_api.route("/trip/<string:id>/stream", methods=["GET"])
@limiter.limit(_LIVE_STREAM_RATE_LIMIT, key_func=get_remote_address)
def trip_stream(id: str) -> ResponseReturnValue:
    """Crew stream: accepts either a normal access token (the web frontend only ever
    sends a ticket) or a short-lived stream ticket, checked in that order. Undecorated because path 2 must succeed with no Authorization
    header at all. Either credential succeeding satisfies the gate; both failing,
    or the trip not being happening, is a single undifferentiated 404.
    ---
    get:
      summary: Crew live position stream for a trip
      description: >
        Server-Sent Events. Authorize via a normal bearer token OR a `?ticket=` query
        param minted by POST .../stream-ticket — not both required.
      parameters:
        - name: ticket
          in: query
          required: false
          schema:
            type: string
      responses:
        200:
          description: SSE stream
          content:
            text/event-stream: {}
        404:
          description: Neither credential authorized, or the trip isn't currently happening
    """
    authorized = False

    user_id = JWTService.resolve_user_id_from_bearer_header()
    if user_id is not None:
        g.current_user_id = user_id
        authorized = bool(_check_trip_ownership(user_id, id))

    if not authorized:
        ticket = request.args.get("ticket")
        authorized = ticket is not None and LiveStreamService.verify_stream_ticket(ticket, id)

    if not authorized:
        return Response(status=HTTPStatus.NOT_FOUND)

    trip = TripService.find_happening_trip(id)
    if trip is None:
        return Response(status=HTTPStatus.NOT_FOUND)

    return Response(
        stream_with_context(LiveStreamService.stream_events(id)),
        mimetype="text/event-stream",
        headers=_SSE_HEADERS,
    )


# Self-authenticating (see docstring above): resolves g.current_user_id inline
# via JWTService.resolve_user_id_from_bearer_header() rather than a wrapping
# auth decorator, since the ticket-only path must succeed with zero
# Authorization header. Tagged the same way JWTService's own decorators are so
# the auth-invariant canary (Tests/40_auth_invariants_test.py) recognises this
# as populated, not a silent gap.
trip_stream._populates_current_user = True  # type: ignore[attr-defined]


@live_api.route("/trip/<string:id>/changes-ticket", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
def post_changes_ticket(id: str) -> ResponseReturnValue:
    """
    ---
    post:
      summary: Mint a short-lived trip-changes stream ticket
      description: >
        For the browser's EventSource, which can't send an Authorization header. Valid
        for the changes stream of this trip only — a position-stream ticket does not
        open it, nor this one that.
      responses:
        200:
          description: The ticket
          content:
            application/json:
              schema:
                type: object
                properties:
                  ticket:
                    type: string
    """
    return jsonify({"ticket": LiveStreamService.mint_changes_ticket(id, str(g.current_user_id))}), HTTPStatus.OK


def _changes_caller(trip_id: str) -> Optional[str]:
    """Who is polling `trip_id` (its change log or its crew positions): a normal access token,
    else a `?ticket=` from POST .../changes-ticket. The rate limiter needs this before the view
    does, so it runs twice per request; verifying a ticket is a signature check."""
    user_id = JWTService.resolve_user_id_from_bearer_header()
    if user_id is None:
        ticket = request.args.get("ticket")
        if ticket is not None:
            user_id = LiveStreamService.verify_changes_ticket(ticket, trip_id)
    return user_id


def _changes_rate_key() -> str:
    user_id = _changes_caller((request.view_args or {}).get("id", ""))
    return f"user:{user_id}" if user_id is not None else f"ip:{get_remote_address()}"


@live_api.route("/trip/<string:id>/changes", methods=["GET"])
@limiter.limit(_CHANGES_POLL_RATE_LIMIT, key_func=_changes_rate_key)
def trip_changes(id: str) -> ResponseReturnValue:
    """What changed on a trip since revision `since`, for a crew member, in any trip state.
    Missing, forbidden and unauthenticated are one undifferentiated 404.
    ---
    get:
      summary: Trip changes since a revision
      description: >
        Poll while the page is visible. Returns `{rev, changes:[{t, id, op}], truncated}` —
        identities only, never field values; a client refetches through its normal read
        path. Without `since` it only reports the current `rev`, to start from. `truncated`
        means the exact changes cannot be given (the log was trimmed or expired, or was lost),
        and the client should refresh everything it shows.
      parameters:
        - name: since
          in: query
          required: false
          schema:
            type: integer
        - name: ticket
          in: query
          required: false
          schema:
            type: string
      responses:
        200:
          description: The changes since `since`
          content:
            application/json:
              schema:
                type: object
                properties:
                  rev:
                    type: integer
                  changes:
                    type: array
                    items:
                      type: object
                      properties:
                        t:
                          type: string
                        id:
                          type: string
                        op:
                          type: string
                  truncated:
                    type: boolean
        404:
          description: Not authorized, or no such trip
        503:
          description: The change log cannot be read; retry after the interval given
    """
    user_id = _changes_caller(id)
    if user_id is None or not LiveStreamService.is_trip_member_cached(id, user_id):
        return Response(status=HTTPStatus.NOT_FOUND)

    try:
        page = TripChangeService.changes_since(id, request.args.get("since", type=int))
    except Exception:
        logger.warning("trip_changes_unavailable", extra={"trip_id": id}, exc_info=True)
        return Response(status=HTTPStatus.SERVICE_UNAVAILABLE, headers={"Retry-After": _CHANGES_RETRY_AFTER_SECONDS})

    response = jsonify(page.to_wire())
    response.headers["Cache-Control"] = "no-store"
    return response


# Self-authenticating, for the same reason as `trip_stream` above.
trip_changes._populates_current_user = True  # type: ignore[attr-defined]


@live_api.route("/trip/<string:id>/positions", methods=["GET"])
@limiter.limit(_CHANGES_POLL_RATE_LIMIT, key_func=_changes_rate_key)
def trip_positions(id: str) -> ResponseReturnValue:
    """The crew's newest positions, for a client that cannot hold the stream open.
    Missing, forbidden, unauthenticated and not-happening are one undifferentiated 404.
    ---
    get:
      summary: Newest position per crew member
      description: >
        Poll while the screen is visible. Authorised like the trip-changes poll: an access
        token, else a `?ticket=` from POST .../changes-ticket. Each entry has the shape of
        the crew stream's snapshot event. A member who has never shared a position is absent.
        The caller's own entry is included.
      parameters:
        - name: ticket
          in: query
          required: false
          schema:
            type: string
      responses:
        200:
          description: The newest ping of each member who has one
          content:
            application/json:
              schema:
                type: object
                properties:
                  positions:
                    type: array
                    items:
                      type: object
                      properties:
                        userId:
                          type: string
                        name:
                          type: string
                        lat:
                          type: number
                        lon:
                          type: number
                        accuracyM:
                          type: number
                          nullable: true
                        headingDeg:
                          type: number
                          nullable: true
                        speedMs:
                          type: number
                          nullable: true
                        recordedAt:
                          type: string
                          format: date-time
        404:
          description: Not authorized, no such trip, or the trip isn't currently happening
    """
    user_id = _changes_caller(id)
    if user_id is None or not LiveStreamService.is_trip_member_cached(id, user_id):
        return Response(status=HTTPStatus.NOT_FOUND)

    if TripService.find_happening_trip(id) is None:
        return Response(status=HTTPStatus.NOT_FOUND)

    response = jsonify({"positions": LivePositionService.snapshot(id)})
    response.headers["Cache-Control"] = "no-store"
    return response


# Self-authenticating, for the same reason as `trip_stream` above.
trip_positions._populates_current_user = True  # type: ignore[attr-defined]
