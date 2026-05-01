from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError, NoResultFound
from marshmallow import ValidationError
from flask import Blueprint, jsonify, request, abort, g

from Schemas.user_schema import UserSchema, UserUpdateSchema
from Services.user_service import UserService
from Services.storage_service import StorageValidationError
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_self
from cryptography.exceptions import InvalidTag

logger = logging.getLogger(__name__)

USER_ENDPOINT = "/api/user"
user_api = Blueprint('user', __name__, url_prefix=USER_ENDPOINT)


@user_api.route("/me", methods=["GET"])
@JWTService.authenticate_restful
def get_me():
    """
    Retrieve the profile of the currently authenticated user.

    Returns:
        JSON response with the user object and 200 status code
    """
    try:
        user = UserService.get_current_user()
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/search", methods=["GET"])
@JWTService.authenticate_restful
def search_users():
    """
    Search active users by email prefix for the purpose of sending trip invitations.

    Query params:
        q: Search string (required, minimum 2 characters)

    Returns:
        JSON array of matching user objects (id, name, surname, mail, avatarUrl)
        and 200 status code
    """
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        abort(HTTPStatus.BAD_REQUEST, description="Search query must be at least 2 characters")

    try:
        users = UserService.search_users(query)
        schema = UserSchema(only=("id", "name", "surname", "mail", "avatar_url"))
        return jsonify(schema.dump(users, many=True)), HTTPStatus.OK

    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_self()
def get(id: str):
    """
    Retrieve a user's full profile by ID.

    Args:
        id: UUID of the user to retrieve

    Returns:
        JSON response with the user object and 200 status code

    Raises:
        404: If the user does not exist
    """
    try:
        user = UserService.get_user_by_id(id)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_self()
def update_user(id: str):
    """
    Partially update a user's profile (name, surname, phone, username, password).

    Only fields present in the request body are applied. Email changes require
    a dedicated verification flow and are not accepted here.

    Args:
        id: UUID of the user to update

    Returns:
        JSON response with the updated user object and 200 status code

    Raises:
        400: If validation fails
        404: If the user does not exist
        409: If a unique constraint is violated
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        validated = UserUpdateSchema().load(raw)
        assert isinstance(validated, dict)
        user = UserService.update_user(id, validated)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description=f"Error updating user with id {id}")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=f"Error: {e}")


@user_api.route("/me/password", methods=["PATCH"])
@JWTService.authenticate_restful
def change_password():
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        current_pwd = raw.get("currentPwd")
        new_pwd = raw.get("newPwd")
        if not current_pwd or not new_pwd:
            abort(HTTPStatus.BAD_REQUEST, description="currentPwd and newPwd are required")
        UserService.change_password(str(g.current_user_id), current_pwd, new_pwd)
        return "", HTTPStatus.NO_CONTENT

    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/re-auth", methods=["POST"])
@JWTService.authenticate_restful
def re_auth():
    try:
        raw = request.get_json()
        if not isinstance(raw, dict) or "password" not in raw:
            abort(HTTPStatus.BAD_REQUEST, description="password is required")
        if not UserService.verify_password(str(g.current_user_id), raw["password"]):
            abort(HTTPStatus.UNAUTHORIZED, description="Password incorrect")
        token = JWTService.generate_elevated_token(str(g.current_user_id))
        return jsonify({"elevatedToken": token}), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/medical-consent", methods=["POST"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def grant_medical_consent():
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        plaintext = raw.get("medicalNotes", "").strip()
        password = raw.get("password")
        if not plaintext:
            abort(HTTPStatus.BAD_REQUEST, description="medicalNotes is required")
        if not password:
            abort(HTTPStatus.BAD_REQUEST, description="password is required for encryption")
        user = UserService.grant_medical_consent(str(g.current_user_id), plaintext, password)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/medical-consent", methods=["DELETE"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def revoke_medical_consent():
    try:
        UserService.revoke_medical_consent(str(g.current_user_id))
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/medical-notes", methods=["GET"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def get_medical_notes():
    try:
        password = request.args.get("password") or (request.get_json() or {}).get("password")
        if not password:
            abort(HTTPStatus.BAD_REQUEST, description="password is required")
        plaintext = UserService.get_medical_notes(str(g.current_user_id), password)
        return jsonify({"medicalNotes": plaintext}), HTTPStatus.OK

    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except InvalidTag:
        abort(HTTPStatus.UNAUTHORIZED, description="Decryption failed")
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/avatar", methods=["POST"])
@JWTService.authenticate_restful
def upload_avatar():
    """
    Upload or replace the avatar for the authenticated user.

    Expects a multipart/form-data request with a 'file' field.
    Accepted MIME types: image/jpeg, image/png, image/webp, image/gif, image/avif, image/svg+xml.
    Size limits: minimum 512 B, maximum 5 MB.

    Returns:
        JSON response with the updated user object and 200 status code

    Raises:
        400: If no file is provided or the file fails validation
    """
    if "file" not in request.files:
        abort(HTTPStatus.BAD_REQUEST, description="No file provided")

    file = request.files["file"]
    if not file.filename:
        abort(HTTPStatus.BAD_REQUEST, description="File has no name")

    try:
        file_bytes = file.read()
        user = UserService.upload_avatar(str(g.current_user_id), file_bytes, file.filename)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except StorageValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/avatar", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_avatar():
    """
    Remove the avatar for the authenticated user.

    Returns:
        204 No Content on success
    """
    try:
        UserService.delete_avatar(str(g.current_user_id))
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_self()
def delete(id: str):
    """
    Permanently delete a user account.

    Args:
        id: UUID of the user to delete

    Returns:
        204 No Content on success

    Raises:
        404: If the user does not exist
        409: If references prevent deletion
    """
    try:
        UserService.delete_user(id)
        return "", HTTPStatus.NO_CONTENT

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description=f"Error deleting user with id {id}")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
