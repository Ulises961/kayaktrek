from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import NoResultFound
from marshmallow import ValidationError
from Schemas.user_schema import UserSchema, UserUpdateSchema
from flask import Blueprint, jsonify, request, abort
from Services.user_service import UserService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_self

# It will print the name of this module when the main app is running
logger = logging.getLogger(__name__)

USER_ENDPOINT = "/api/user"
user_api = Blueprint('user', __name__, url_prefix=USER_ENDPOINT)

@user_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_self()
def get(id:str):
    """
    UserResource GET method. Retrieves the information related to the user with the passed id in the request
    """
    try:
        logger.info(
            f"Retrieving user with id {id}")
                    
        user = UserService.get_user_by_id(id)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK
    
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found in database")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@user_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_self()
def update_user(id: str):
    """
    PATCH /api/user/<id> — Partially update an existing user profile.

    Accepts a JSON body with any subset of mutable user fields (name, surname, phone, username).
    Only the fields present in the body are applied; omitted fields are left unchanged.
    Credential fields (mail, password) are managed through the auth endpoints, not here.

    Returns:
        200 with the updated user object, or 404 if not found.
    """

    try:
        raw = request.get_json()
        validated = UserUpdateSchema().load(raw)
        user_data = {**raw, **validated}  # sanitized scalars override raw; image passes through
        user = UserService.update_user(id, user_data)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description=f"Error updating user with id {id}")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=f"Error:{e}")

@user_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_self()
def delete(id: str):
    try:
        UserService.delete_user(id)       
        return "Deletion successful", 200
    
    except HTTPException:
        raise
    except ValueError:
        abort(HTTPStatus.CONFLICT, description=f"Error deleting user with id {id}")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=f"Error:{e}")