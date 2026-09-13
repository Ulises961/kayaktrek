from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound
from werkzeug.exceptions import HTTPException

from Api.cache import cache
from Api.database import db
from Schemas.sea_schema import SeaSchema, _diamond_schema, _gate_schema
from Schemas.weather_schema import WeatherSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.day_service import DayService
from Services.open_meteo_service import OpenMeteoService
from Services.sea_service import SeaService
from Services.tidal_service import TidalService
from Tasks.weather_fetch_task import fetch_weather

logger = logging.getLogger(__name__)

sea_api = Blueprint('sea', __name__, url_prefix='/api/v1/day')

_schema = SeaSchema()
_weather_schema = WeatherSchema()

# Order-of-minutes cooldown per docs/mobile/sync-protocol-spec.md §6.4 — guards OpenMeteo
# instead of serving a stale cache to someone about to launch.
_WEATHER_REFRESH_COOLDOWN_SECONDS = 300


@sea_api.route('/<string:id>/sea', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_sea(id: str):
    """
    SeaResource GET method. Retrieves the sea/tidal record for a day.
    ---
    get:
      summary: Get the sea record for a day
      responses:
        200:
          description: The sea record
          content:
            application/json:
              schema: SeaSchema
        404:
          description: Sea record not found for this day
    """
    try:
        sea = SeaService.get_by_day_id(id)
        return jsonify(_schema.dump(sea)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Sea record not found for this day")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_sea_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/sea', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('day')
def create_sea(id: str):
    """
    SeaResource POST method. Creates the sea/tidal record for a day.
    ---
    post:
      summary: Create the sea record for a day
      requestBody:
        content:
          application/json:
            schema: SeaSchema
      responses:
        201:
          description: The created sea record
          content:
            application/json:
              schema: SeaSchema
        400:
          description: Validation error
        409:
          description: A sea record already exists for this day
    """
    try:
        body = request.get_json() or {}
        data = _schema.load(body)
        sea = SeaService.create(id, data)
        return jsonify(_schema.dump(sea)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except IntegrityError:
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="A sea record already exists for this day")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_sea_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/sea', methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('day')
def update_sea(id: str):
    """
    SeaResource PATCH method. Partially updates the sea/tidal record for a day.

    Only fields present in the body are applied; omitted fields are left unchanged.
    ---
    patch:
      summary: Update the sea record for a day
      requestBody:
        content:
          application/json:
            schema: SeaSchema
      responses:
        200:
          description: The updated sea record
          content:
            application/json:
              schema: SeaSchema
        400:
          description: Validation error
        404:
          description: Sea record not found for this day
    """
    try:
        body = request.get_json() or {}
        data = _schema.load(body, partial=True)
        sea = SeaService.update(id, data)
        return jsonify(_schema.dump(sea)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Sea record not found for this day")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("update_sea_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/tidal-gates', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_tidal_gates(id: str):
    """
    SeaResource GET method. Resolves tidal-gate warnings for a day's route points.
    ---
    get:
      summary: Get tidal-gate warnings for a day
      description: >
        One warning per route point with an interpolated tidal-stream rate strong
        enough to be flagged, ordered along the day's route.
      responses:
        200:
          description: The tidal-gate warnings
          content:
            application/json:
              schema:
                type: array
                items: TidalGateWarningSchema
        404:
          description: Day not found
    """
    try:
        day = DayService.get_day_by_id(id)
        sea = day.sea
        points = sorted(day.points or [], key=lambda p: (p.next_id is None, str(p.id)))
        gates = TidalService.tidal_gates_for_day(day, points, sea)
        return jsonify(_gate_schema.dump(gates)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_tidal_gates_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/weather', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_weather(id: str):
    """
    SeaResource GET method. Retrieves the weather record for a day.
    ---
    get:
      summary: Get the weather record for a day
      responses:
        200:
          description: The weather record
          content:
            application/json:
              schema: WeatherSchema
        404:
          description: Day not found, or no weather record exists for this day
    """
    try:
        day = DayService.get_day_by_id(id)
        if day.weather is None:
            abort(HTTPStatus.NOT_FOUND, description="No weather record for this day")
        return jsonify(_weather_schema.dump(day.weather)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_weather_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/weather/fetch', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('day')
def trigger_weather_fetch(id: str):
    """
    SeaResource POST method. Queues a Celery task to fetch weather for a day from OpenMeteo.
    ---
    post:
      summary: Trigger a weather fetch for a day
      responses:
        202:
          description: The fetch task was queued
          content:
            application/json:
              schema:
                type: object
                properties:
                  taskId:
                    type: string
        400:
          description: Day must have a date before fetching weather
        404:
          description: Day not found
    """
    try:
        day = DayService.get_day_by_id(id)
        if not day.date:
            abort(HTTPStatus.BAD_REQUEST, description="Day must have a date before fetching weather")
        result = fetch_weather.delay(str(day.id), request_id=g.request_id)
        return jsonify({"taskId": result.id}), HTTPStatus.ACCEPTED
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("weather_fetch_trigger_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/weather/refresh', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('day')
def trigger_weather_refresh(id: str):
    """
    SeaResource POST method. Device-initiated forecast refresh for a paddler about to
    launch — bypasses OpenMeteo's planning-desk cache (docs/mobile/sync-protocol-spec.md
    §6.4), guarded by a short per-day cooldown instead of a stale-cache read. Distinct
    from /weather/fetch, which keeps serving the ordinary 6h cache.
    ---
    post:
      summary: Force-refresh a day's weather/sea forecast, bypassing the planning-desk cache
      responses:
        202:
          description: The refresh task was queued
          content:
            application/json:
              schema:
                type: object
                properties:
                  taskId:
                    type: string
        400:
          description: Day must have a date before fetching weather
        404:
          description: Day not found
        429:
          description: Refreshed too recently for this day
    """
    try:
        day = DayService.get_day_by_id(id)
        if not day.date:
            abort(HTTPStatus.BAD_REQUEST, description="Day must have a date before fetching weather")

        cooldown_key = f"weather_refresh_cooldown:{id}"
        if cache.get(cooldown_key):
            abort(HTTPStatus.TOO_MANY_REQUESTS, description="Weather was just refreshed for this day — try again shortly")
        cache.set(cooldown_key, True, timeout=_WEATHER_REFRESH_COOLDOWN_SECONDS)

        result = fetch_weather.delay(str(day.id), request_id=g.request_id, force_refresh=True)
        return jsonify({"taskId": result.id}), HTTPStatus.ACCEPTED
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("weather_refresh_trigger_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/global-wind-vectors', methods=['GET'])
@JWTService.authenticate_restful
def get_global_wind_vectors():
    """
    SeaResource GET method. Fetches a global 10-degree wind velocity grid from OpenMeteo,
    for the planner's map-wide wind overlay (independent of any single day/trip).
    ---
    get:
      summary: Get a global wind velocity grid
      parameters:
        - name: date
          in: query
          required: true
          schema:
            type: string
            format: date
        - name: hour
          in: query
          required: false
          schema:
            type: integer
            default: 12
      responses:
        200:
          description: The velocity grid, in leaflet-velocity format
          content:
            application/json:
              schema:
                type: object
                properties:
                  source:
                    type: string
                  grid:
                    type: array
                    items:
                      type: object
        400:
          description: date parameter required
    """
    date_str = request.args.get("date")
    try:
        if not date_str:
            abort(HTTPStatus.BAD_REQUEST, description="date parameter required")
        hour = int(request.args.get("hour", 12))
        grid = OpenMeteoService.fetch_global_wind(date_str, hour)
        return jsonify(grid), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("global_wind_vectors_error", extra={"date": date_str, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


def _day_bounding_box(day, pad: float = 0.5) -> tuple:
    """Return (lat_min, lat_max, lon_min, lon_max) from the day's route points."""
    lats = [float(p.latitude) for p in (day.points or []) if p.latitude is not None]
    lons = [float(p.longitude) for p in (day.points or []) if p.longitude is not None]
    if lats and lons:
        return (min(lats) - pad, max(lats) + pad, min(lons) - pad, max(lons) + pad)
    return (49.0, 60.0, -8.0, 2.0)  # UK coastal fallback


@sea_api.route('/<string:id>/wind-vectors', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_wind_vectors(id: str):
    """
    SeaResource GET method. Builds a leaflet-velocity wind grid for a day, from its
    Weather record's hourly states at the given UTC hour (bounded to the day's route).
    ---
    get:
      summary: Get the wind velocity grid for a day
      parameters:
        - name: hour
          in: query
          required: false
          schema:
            type: integer
            default: 12
      responses:
        200:
          description: The velocity grid, in leaflet-velocity format (empty grid if no weather data)
          content:
            application/json:
              schema:
                type: object
                properties:
                  source:
                    type: string
                  grid:
                    type: array
                    items:
                      type: object
        404:
          description: Day not found
    """
    try:
        hour = int(request.args.get("hour", 12))
        day = DayService.get_day_by_id(id)
        weather = day.weather
        states = weather.weather_states if weather else []
        bbox = _day_bounding_box(day)
        grid = TidalService.build_wind_velocity_grid(bbox, states, hour)
        return jsonify(grid), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("wind_vectors_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/wave-vectors', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_wave_vectors(id: str):
    """
    SeaResource GET method. Builds a leaflet-velocity wave grid for a day, from its
    Sea record's hourly states at the given UTC hour (land-masked, bounded to the day's route).
    ---
    get:
      summary: Get the wave velocity grid for a day
      parameters:
        - name: hour
          in: query
          required: false
          schema:
            type: integer
            default: 12
      responses:
        200:
          description: The velocity grid, in leaflet-velocity format (empty grid if no sea data)
          content:
            application/json:
              schema:
                type: object
                properties:
                  source:
                    type: string
                  grid:
                    type: array
                    items:
                      type: object
        404:
          description: Day not found
    """
    try:
        hour = int(request.args.get("hour", 12))
        day = DayService.get_day_by_id(id)
        sea = day.sea
        states = sea.sea_states if sea else []
        bbox = _day_bounding_box(day)
        grid = TidalService.build_wave_velocity_grid(bbox, states, hour)
        return jsonify(grid), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("wave_vectors_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@sea_api.route('/<string:id>/tidal-diamonds', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_tidal_diamonds(id: str):
    """
    SeaResource GET method. Resolves every tidal diamond relevant to a day at the given
    clock hour (the itinerary's user-created diamonds plus any seeded atlas stations
    within 50 km of the route), each with its rate/direction for that hour plus its
    full hourly table.
    ---
    get:
      summary: Get tidal diamonds for a day
      parameters:
        - name: hour
          in: query
          required: false
          schema:
            type: integer
            default: 12
      responses:
        200:
          description: The tidal diamonds
          content:
            application/json:
              schema:
                type: array
                items: TidalDiamondSchema
        404:
          description: Day not found
    """
    try:
        hour = int(request.args.get("hour", 12))
        day = DayService.get_day_by_id(id)
        diamonds = TidalService.day_diamonds(day, day.sea, hour)
        return jsonify(_diamond_schema.dump(diamonds)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Day not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("tidal_diamonds_error", extra={"day_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
