from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound
from werkzeug.exceptions import HTTPException

from Api.database import db
from Schemas.sea_schema import SeaSchema, _gate_schema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.day_service import DayService
from Services.sea_service import SeaService
from Services.tidal_service import TidalService
from Tasks.weather_fetch_task import fetch_weather

logger = logging.getLogger(__name__)

sea_api = Blueprint('sea', __name__, url_prefix='/api/day')

_schema = SeaSchema()


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
