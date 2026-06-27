from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound
from werkzeug.exceptions import HTTPException

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


@sea_api.route('/<string:id>/sea', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('day')
def get_sea(id: str):
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


@sea_api.route('/global-wind-vectors', methods=['GET'])
@JWTService.authenticate_restful
def get_global_wind_vectors():
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
