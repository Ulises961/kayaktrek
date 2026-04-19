from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy.exc import IntegrityError
from Schemas.log_schema import LogSchema 
from Api.database import db
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.log_service import LogService


logger = logging.getLogger(__name__) # It will print the name of this module when the main app is running

LOG_ENDPOINT = "/api/log"
log_api = Blueprint('log', __name__, url_prefix=LOG_ENDPOINT)


@log_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_logs():
    """
    LogResource GET method. Retrieves all the logs associated to a user
    """
    try:
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        result = LogService.get_logs_by_user(g.current_user_id, page=page, per_page=per_page)
        schema = LogSchema()
        return jsonify({
            "items": [schema.dump(log) for log in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "pages": result["pages"],
        }), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error retrieving logs: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=f"{e}")



@log_api.route("/endorsed", methods=["GET"])
@JWTService.authenticate_restful
def get_endorsed_logs():
    """
    LogResource GET method. Retrieves all the logs associated to a user
    """
    try:        
        
        logs = LogService.get_endorsed_logs(g.current_user_id) 
        return jsonify([LogSchema().dump(log) for log in logs]), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error retrieving logs: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=f"{e}")


@log_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def post():
    """
    LogResource POST method. Adds a new log to the database.

    :return: Log, 201 HTTP status code.
    """
    try:
        log_json = request.get_json()
        log = LogService.create_log(log_json)
        return jsonify(LogSchema().dump(log)), HTTPStatus.CREATED
    except HTTPException:
        raise
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")

    except Exception as e:
        logger.error(f"Error creating log: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@log_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def update_log(id: str):
    """
    PATCH /api/log/<id> — Partially update an existing paddling log.

    Accepts a JSON body with any subset of mutable log fields.
    Only the fields present in the body are applied; omitted fields are left unchanged.
    Authorship fields (userId) are never overwritten by this endpoint.

    Returns:
        200 with the updated log object, or 404 if not found.
    """
    try:
        updated_log = LogService.update_log(id, request.get_json())

        return jsonify(LogSchema().dump(updated_log)), HTTPStatus.OK
    
    except HTTPException:
        raise
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")

    except Exception as e:
        logger.error(f"Error creating log: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@log_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def delete_log(id: str):
    try:
        logger.info(f"Deleting log with id {id} ")

        LogService.delete_log(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
    
    except HTTPException:
        raise
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, message="Database integrity violated")

    except Exception as e:
        logger.error(f"Error creating log: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))