from http import HTTPStatus
import logging
from flask import Blueprint, g, jsonify, request, abort, Response
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.itinerary_schema import (
    ItinerarySchema,
    ItineraryPublicSchema,
    ItineraryExploreItemSchema,
)
from Api.database import db
from Api.limiter import limiter
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner, check_resource_ownership
from Services.itinerary_service import ItineraryService

logger = logging.getLogger(__name__)

ITINERARY_ENDPOINT = "/api/v1/itinerary"
itinerary_api = Blueprint("itinerary", __name__, url_prefix=ITINERARY_ENDPOINT)


@itinerary_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_itineraries():
    """GET /api/itinerary/all — Return all itineraries owned by the current user.
    ---
    get:
      summary: List the current user's itineraries
      responses:
        200:
          description: The user's itineraries
          content:
            application/json:
              schema:
                type: array
                items: ItinerarySchema
    """
    itineraries = ItineraryService.get_itineraries_by_user(g.current_user_id)
    return jsonify([ItinerarySchema().dump(i) for i in itineraries]), HTTPStatus.OK


@itinerary_api.route("/explore", methods=["GET"])
@limiter.limit("30 per minute", key_func=get_remote_address)
def get_explore():
    """GET /api/itinerary/explore — Unauthenticated. Filterable, paginated public-route
    discovery. Query params: page, per_page (capped 100); bbox minLat/minLng/maxLat/maxLng;
    season (repeatable); minMiles/maxMiles; minDays/maxDays; name; sort
    (recent|distance|duration|name). Returns {items, total, page, pages}.
    ---
    get:
      summary: Search public itineraries
      description: >
        Facets (distance, day count, season, centroid) are derived from the route's own
        points and day dates — no private Trip data is ever exposed here.
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: minLat
          in: query
          schema:
            type: number
        - name: minLng
          in: query
          schema:
            type: number
        - name: maxLat
          in: query
          schema:
            type: number
        - name: maxLng
          in: query
          schema:
            type: number
        - name: season
          in: query
          description: Repeatable. One or more of the values below.
          schema:
            type: array
            items:
              type: string
              enum: [winter, spring, summer, autumn]
        - name: minMiles
          in: query
          schema:
            type: number
        - name: maxMiles
          in: query
          schema:
            type: number
        - name: minDays
          in: query
          schema:
            type: integer
        - name: maxDays
          in: query
          schema:
            type: integer
        - name: name
          in: query
          schema:
            type: string
        - name: sort
          in: query
          schema:
            type: string
            enum: [recent, distance, duration, name]
            default: recent
      responses:
        200:
          description: A page of public itineraries
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: ItineraryExploreItemSchema
                  total:
                    type: integer
                  page:
                    type: integer
                  pages:
                    type: integer
    """
    args = request.args
    result = ItineraryService.search_public_itineraries(
        page=args.get("page", 1, type=int),
        per_page=args.get("per_page", 20, type=int),
        min_lat=args.get("minLat", type=float),
        min_lng=args.get("minLng", type=float),
        max_lat=args.get("maxLat", type=float),
        max_lng=args.get("maxLng", type=float),
        seasons=args.getlist("season"),
        min_miles=args.get("minMiles", type=float),
        max_miles=args.get("maxMiles", type=float),
        min_days=args.get("minDays", type=int),
        max_days=args.get("maxDays", type=int),
        name=args.get("name"),
        sort=args.get("sort", "recent"),
    )
    schema = ItineraryExploreItemSchema()
    return jsonify({
        "items": [schema.dump(item) for item in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
    }), HTTPStatus.OK


@itinerary_api.route("/<string:id>/public", methods=["GET"])
def get_public_itinerary(id: str):
    """GET /api/itinerary/<id>/public — Unauthenticated. Returns 404 if not public.
    ---
    get:
      summary: Get a public itinerary by id
      description: Unauthenticated. Excludes notes, private images, and any private trip data.
      responses:
        200:
          description: The public itinerary
          content:
            application/json:
              schema: ItineraryPublicSchema
        404:
          description: Itinerary not found or not public
    """
    try:
        itinerary = ItineraryService.get_public_itinerary(id)
        payload = ItineraryPublicSchema().dump(itinerary)
        payload["originalAuthor"] = ItineraryService.resolve_original_author(itinerary)
        return jsonify(payload), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Itinerary not found or not public")


@itinerary_api.route("/story/public/<token>", methods=["GET"])
@limiter.limit("30 per minute", key_func=get_remote_address)
def get_story_by_token(token: str):
    """GET /api/itinerary/story/public/<token> — Unauthenticated, unlisted story link.
    ---
    get:
      summary: Get a public itinerary by its unlisted story-share token
      description: Unauthenticated. The token is unguessable and not otherwise discoverable.
      responses:
        200:
          description: The public itinerary
          content:
            application/json:
              schema: ItineraryPublicSchema
        404:
          description: Story not found
    """
    try:
        itinerary = ItineraryService.get_story_by_token(token)
        payload = ItineraryPublicSchema().dump(itinerary)
        payload["originalAuthor"] = ItineraryService.resolve_original_author(itinerary)
        return jsonify(payload), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Story not found")


@itinerary_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('itinerary', read_only=True)
def get_itinerary(id: str):
    """GET /api/itinerary/<id> — Return itinerary by ID (owner or trip member).
    ---
    get:
      summary: Get an itinerary by id
      responses:
        200:
          description: The itinerary, including its days, points, and staged (unapplied) edits
          content:
            application/json:
              schema: ItinerarySchema
    """
    itinerary = ItineraryService.get_itinerary_by_id(id)
    schema = ItinerarySchema()
    schema.include_staging = True  # type: ignore[attr-defined]
    return jsonify(schema.dump(itinerary)), HTTPStatus.OK


@itinerary_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_itinerary():
    """POST /api/itinerary/create — Create a new itinerary.

    tripId is optional. If provided, user must be a member of that trip.
    name is optional when tripId is provided (derived from trip.destination).
    name is required for standalone itineraries.
    ---
    post:
      summary: Create an itinerary
      description: >
        tripId is optional; if provided the caller must be a trip member. name is
        derived from the trip's destination when tripId is present and name is
        omitted; otherwise name is required.
      requestBody:
        content:
          application/json:
            schema: ItinerarySchema
      responses:
        201:
          description: The created itinerary, including its staged (unapplied) edits
          content:
            application/json:
              schema: ItinerarySchema
        400:
          description: name missing for a standalone itinerary, or a validation error
        403:
          description: tripId provided but the caller is not a member of that trip
        404:
          description: tripId does not reference an existing trip
        409:
          description: Database integrity constraint violated
    """
    data = request.get_json() or {}
    trip_id = data.get("tripId")

    if trip_id:
        has_access = check_resource_ownership(resource_type="trip", resource_id=trip_id)
        if has_access is None:
            abort(HTTPStatus.NOT_FOUND, description=f"Trip {trip_id} not found")
        if not has_access:
            abort(HTTPStatus.FORBIDDEN, description="Access denied to trip")

    try:
        itinerary = ItineraryService.create_itinerary(data, g.current_user_id)
        schema = ItinerarySchema()
        schema.include_staging = True
        return jsonify(schema.dump(itinerary)), HTTPStatus.CREATED

    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except IntegrityError:
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")


@itinerary_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def update_itinerary(id: str):
    """PATCH /api/itinerary/<id> — Partially update an itinerary (owner only).
    ---
    patch:
      summary: Partially update an itinerary
      description: >
        Only whitelisted mutable fields are applied; a `days` key, if present,
        replaces the itinerary's day list wholesale. Public itineraries are
        read-only — fork them to make changes.
      requestBody:
        content:
          application/json:
            schema: ItineraryUpdateSchema
      responses:
        200:
          description: The updated itinerary
          content:
            application/json:
              schema: ItinerarySchema
        400:
          description: Validation error
        404:
          description: Itinerary not found
        409:
          description: The itinerary is public and read-only, or a database integrity constraint was violated
    """
    try:
        updated = ItineraryService.update_itinerary(id, request.get_json() or {})
        return jsonify(ItinerarySchema().dump(updated)), HTTPStatus.OK

    except HTTPException:
        raise
    except PermissionError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except IntegrityError:
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")


@itinerary_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def delete_itinerary(id: str):
    """DELETE /api/itinerary/<id> — Delete an itinerary (owner only).
    ---
    delete:
      summary: Delete an itinerary
      responses:
        200:
          description: Deletion successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Itinerary not found
        409:
          description: Cannot delete itinerary due to existing references
    """
    try:
        ItineraryService.delete_itinerary(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Itinerary {id} not found")
    except IntegrityError:
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Cannot delete itinerary due to existing references")


@itinerary_api.route("/<string:id>/story-share", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def generate_story_share(id: str):
    """POST /api/itinerary/<id>/story-share — Generate/regenerate the unlisted
    story-share link. Regenerating invalidates the previous link.
    ---
    post:
      summary: Generate or regenerate the unlisted story-share link
      description: Regenerating invalidates the previous link — old links stop resolving.
      responses:
        200:
          description: The itinerary, with the new story-share token
          content:
            application/json:
              schema: ItinerarySchema
        404:
          description: Itinerary not found
    """
    try:
        itinerary = ItineraryService.generate_story_share(id, g.current_user_id)
        return jsonify(ItinerarySchema().dump(itinerary)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Itinerary {id} not found")


@itinerary_api.route("/<string:id>/fork", methods=["POST"])
@JWTService.authenticate_restful
def fork_itinerary(id: str):
    """POST /api/itinerary/<id>/fork — Fork a public itinerary into a private copy.
    ---
    post:
      summary: Fork a public itinerary into a private copy
      description: The caller becomes the owner of the new copy; attribution to the original author is preserved.
      responses:
        201:
          description: The forked itinerary's id
          content:
            application/json:
              schema:
                type: object
                properties:
                  itineraryId:
                    type: string
        403:
          description: The source itinerary cannot be forked
        404:
          description: Itinerary not found or not public
    """
    try:
        fork = ItineraryService.fork_itinerary(id, g.current_user_id)
        return jsonify({"itineraryId": str(fork.id)}), HTTPStatus.CREATED

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Itinerary not found or not public")
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))


@itinerary_api.route("/<string:id>/apply-boundaries", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('itinerary')
def apply_boundaries(id: str):
    """POST /api/itinerary/<id>/apply-boundaries — Batch-apply day boundaries (owner only).
    ---
    post:
      summary: Batch-apply day boundaries
      description: >
        Applies day-splitting boundaries and any accompanying point edits in a single
        transaction.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                boundaries:
                  type: array
                  items:
                    type: object
                    properties:
                      dayId:
                        type: string
                      startPointId:
                        type: string
                      endPointId:
                        type: string
                      date:
                        type: string
                        format: date
                points:
                  type: array
                  items:
                    type: object
                    properties:
                      id:
                        type: string
                      type:
                        type: string
                      name:
                        type: string
      responses:
        200:
          description: The itinerary, including its staged (unapplied) edits
          content:
            application/json:
              schema: ItinerarySchema
        400:
          description: boundaries is not a list, or another validation error
        404:
          description: Itinerary not found
        500:
          description: Unexpected error applying boundaries
    """
    body = request.get_json() or {}
    boundaries = body.get("boundaries", [])
    point_updates = body.get("points", [])

    if not isinstance(boundaries, list):
        abort(HTTPStatus.BAD_REQUEST, description="boundaries must be a list")

    try:
        itinerary = ItineraryService.apply_boundaries(id, boundaries, point_updates)
        schema = ItinerarySchema()
        schema.include_staging = True  # type: ignore[attr-defined]
        return jsonify(schema.dump(itinerary)), HTTPStatus.OK

    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception:
        db.session.rollback()
        logger.exception("apply_boundaries_error", extra={"itinerary_id": id})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR)


@itinerary_api.route("/<string:id>/export", methods=["GET"])
@JWTService.authenticate_optional
def export_gpx(id: str):
    """GET /api/itinerary/<id>/export?format=gpx

    Authenticated owner/member: full export including notes.
    Unauthenticated: allowed only if itinerary is public; notes stripped.
    ---
    get:
      summary: Export an itinerary as a GPX file
      description: >
        Authenticated owner/member gets a full export including notes. Unauthenticated
        access is allowed only if the itinerary is public, with notes stripped.
      parameters:
        - name: format
          in: query
          description: Only 'gpx' is supported.
          schema:
            type: string
            default: gpx
            enum: [gpx]
      responses:
        200:
          description: The GPX file
          content:
            application/gpx+xml: {}
        400:
          description: Unsupported format
        404:
          description: Itinerary not found, or not public and the caller is unauthenticated
    """
    fmt = request.args.get("format", "gpx")
    if fmt != "gpx":
        abort(HTTPStatus.BAD_REQUEST, description="Only format=gpx is supported")

    current_user_id = g.get("current_user_id")
    include_private = False

    try:
        itinerary = ItineraryService.get_itinerary_by_id(id)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Itinerary not found")

    if current_user_id:
        has_access = check_resource_ownership(resource_type="itinerary", resource_id=id, read_only=True)
        if has_access:
            include_private = True
    else:
        if not itinerary.is_public:
            abort(HTTPStatus.NOT_FOUND, description="Itinerary not found")

    gpx_bytes = ItineraryService.export_gpx(id, include_private=include_private)
    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in itinerary.name)
    return Response(
        gpx_bytes,
        mimetype="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.gpx"'},
    )


@itinerary_api.route("/import", methods=["POST"])
@JWTService.authenticate_restful
def import_gpx():
    """POST /api/itinerary/import — Import a GPX file (multipart, field name 'file').
    ---
    post:
      summary: Import a GPX file as a new itinerary
      description: The caller becomes the owner of the imported itinerary.
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                epsilon:
                  type: number
                  description: Douglas-Peucker simplification tolerance in degrees.
                  default: 0.0001
              required:
                - file
      responses:
        201:
          description: The imported itinerary's id
          content:
            application/json:
              schema:
                type: object
                properties:
                  itineraryId:
                    type: string
        400:
          description: No file field, not a .gpx file, or the GPX content is invalid
        500:
          description: Unexpected error importing the GPX file
    """
    if "file" not in request.files:
        abort(HTTPStatus.BAD_REQUEST, description="No file field in request")

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".gpx"):
        abort(HTTPStatus.BAD_REQUEST, description="Only .gpx files are accepted")

    file_bytes = file.read()
    epsilon = float(request.form.get("epsilon", 0.0001))

    try:
        itinerary = ItineraryService.import_gpx(
            file_bytes=file_bytes,
            filename=file.filename,
            user_id=g.current_user_id,
            epsilon=epsilon,
        )
        return jsonify({"itineraryId": str(itinerary.id)}), HTTPStatus.CREATED

    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception:
        db.session.rollback()
        logger.exception("gpx_import_error")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR)
