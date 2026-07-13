from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import NoResultFound
from Schemas.log_schema import LogSchema
from Api.database import db
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.log_service import LogService, LogNotEndorsableError


logger = logging.getLogger(__name__) # It will print the name of this module when the main app is running

LOG_ENDPOINT = "/api/v1/log"
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
        sort = request.args.get("sort", "newest")
        result = LogService.get_logs_by_user(g.current_user_id, page=page, per_page=per_page, sort=sort)
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
    LogResource GET method. Retrieves a paginated, sorted page of logs endorsed
    by the current user.
    """
    try:
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        sort = request.args.get("sort", "newest")
        result = LogService.get_endorsed_logs(g.current_user_id, page=page, per_page=per_page, sort=sort)
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


@log_api.route("/stats", methods=["GET"])
@JWTService.authenticate_restful
def get_stats():
    """GET /api/log/stats — aggregate logbook stats for the authenticated user."""
    try:
        return jsonify(LogService.stats_for_user(g.current_user_id)), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error retrieving log stats: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@log_api.route("/<string:id>/endorse", methods=["POST"])
@JWTService.authenticate_restful
def endorse_log(id: str):
    """POST /api/log/<id>/endorse — endorse another paddler's log under the same-trip rule.

    Deliberately NOT @require_owner: the endorser is by definition not the author. The
    service enforces who may endorse (shared trip, not self, log is trip-linked).
    """
    try:
        LogService.endorse_log(id, g.current_user_id)
        return jsonify({"message": "Log endorsed"}), HTTPStatus.OK
    except HTTPException:
        raise
    except LogNotEndorsableError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=str(e))
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")
    except Exception as e:
        logger.error(f"Error endorsing log: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@log_api.route("/<string:id>/endorse", methods=["DELETE"])
@JWTService.authenticate_restful
def unendorse_log(id: str):
    """DELETE /api/log/<id>/endorse — withdraw the caller's own endorsement.

    Caller-scoped: removing your own endorsement needs no shared-trip recheck.
    """
    try:
        LogService.unendorse_log(id, g.current_user_id)
        return jsonify({"message": "Endorsement withdrawn"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")
    except Exception as e:
        logger.error(f"Error withdrawing endorsement: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


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

@log_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def get_log(id: str):
    try:
        log = LogService.get_log_by_id(id)
        return jsonify(LogSchema().dump(log)), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error retrieving log: {e}")
        abort(HTTPStatus.NOT_FOUND, description=str(e))


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