from http import HTTPStatus
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError, NoResultFound
from marshmallow import ValidationError
from flask import Blueprint, jsonify, request, abort, g

import hashlib
from io import BytesIO

from flask import current_app, send_file

from Schemas.user_schema import UserSchema, UserUpdateSchema, PublicUserSchema
from Services.user_service import UserService
from Services.log_service import LogService
from Services.storage_service import StorageService, StorageValidationError
from Services.auth_service import AuthService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_self, require_admin
from Api.limiter import limiter
from Models.auth_token import AuthTokenType
from cryptography.exceptions import InvalidTag
from Tasks.data_export import export_user_data
from Services.mail_service import send_template_email

logger = logging.getLogger(__name__)

USER_ENDPOINT = "/api/v1/user"
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


@user_api.route("/search/paddlers", methods=["GET"])
@JWTService.authenticate_restful
@limiter.limit("30 per minute", key_func=lambda: str(g.current_user_id))
def search_paddlers():
    """Buddy finder — search public paddlers by username / name / surname (M7b).

    Query params: q (search term), page, per_page. Returns a paginated, block-filtered
    list of public profiles, each annotated with the caller's relationship
    (none | pending_outgoing | pending_incoming | buddy) and connection id.
    """
    try:
        query = request.args.get("q", "")
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        result = UserService.search_paddlers(
            str(g.current_user_id), query, page=page, per_page=per_page
        )
        return jsonify({
            "items": result["items"],
            "total": result["total"],
            "page": result["page"],
            "pages": result["pages"],
        }), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error searching paddlers: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/<string:username>/public", methods=["GET"])
@JWTService.authenticate_optional
def get_public_profile(username: str):
    """
    Retrieve a paddler's public profile by username. Auth-optional (mirrors
    GET /api/itinerary/explore): anonymous and authenticated callers both allowed.

    Returns a privacy-safe projection (identity, bio, home location, opt-in
    certifications, aggregate stats). Returns a single 404 for a missing, inactive,
    deletion-pending, or non-public profile — no existence oracle.
    """
    try:
        viewer_id = getattr(g, "current_user_id", None)
        user = UserService.get_public_profile(username, viewer_id)
        data = PublicUserSchema().dump(user)
        data["stats"] = LogService.stats_for_user(str(user.id))
        return jsonify(data), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Profile not found")
    except Exception as e:
        logger.error(f"Error retrieving public profile for {username}: {e}")
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

    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/generate-keypair", methods=["POST"])
@JWTService.authenticate_restful
def generate_keypair():
    try:
        raw = request.get_json()
        if not isinstance(raw, dict) or "password" not in raw:
            abort(HTTPStatus.BAD_REQUEST, description="password is required")
        UserService.generate_keypair_for_user(str(g.current_user_id), raw["password"])
        return jsonify({"hasKeypair": True}), HTTPStatus.OK

    except HTTPException:
        raise
    except PermissionError:
        abort(HTTPStatus.UNAUTHORIZED, description="Password incorrect")
    except ValueError:
        abort(HTTPStatus.CONFLICT, description="Keypair already exists")
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/re-auth", methods=["POST"])
@JWTService.authenticate_restful
@limiter.limit("10 per minute", key_func=lambda: str(g.current_user_id))
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


@user_api.route("/me/medical-notes", methods=["POST"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def get_medical_notes():
    try:
        password = (request.get_json() or {}).get("password")
        if not password:
            abort(HTTPStatus.BAD_REQUEST, description="password is required")
        plaintext = UserService.get_medical_notes(str(g.current_user_id), password)
        return jsonify({"medicalNotes": plaintext}), HTTPStatus.OK

    except HTTPException:
        raise
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


@user_api.route("/me/data-export", methods=["POST"])
@JWTService.authenticate_restful
@limiter.limit("1 per day", key_func=lambda: str(g.current_user_id))
def request_data_export():
    """
    Queue a GDPR data export for the authenticated user (Art. 15 / 20).
    The user will receive an email with a one-time download link (24 h TTL).

    Rate limited to 1 request per day per user.

    Returns:
        202 Accepted
    """
    export_user_data.delay(str(g.current_user_id), request_id=g.get("request_id"))
    return "", HTTPStatus.ACCEPTED


@user_api.route("/me/data-export/<string:token>", methods=["GET"])
def download_data_export(token: str):
    """
    Stream and then delete a previously generated data export file.
    The token is single-use; the file is removed after download.

    Returns:
        200 with the JSON file as an attachment
        400 if the token is invalid / expired / already used
        404 if the object is missing (already downloaded or task not yet complete)
    """
    try:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        AuthService._consume_token(token, AuthTokenType.DATA_EXPORT)
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))

    object_key = f"{token_hash}.json"
    data = StorageService.download_export(object_key)
    if data is None:
        abort(HTTPStatus.NOT_FOUND, description="Export file not found or already downloaded")

    # Single-use: remove the object now that we hold its bytes in memory.
    StorageService.delete_export(object_key)

    return send_file(
        BytesIO(data),
        mimetype="application/json",
        as_attachment=True,
        download_name="kayak-planner-export.json",
    )


@user_api.route("/me", methods=["DELETE"])
@JWTService.authenticate_restful
def request_deletion():
    """
    Begin the GDPR erasure grace period (Art. 17).

    Deactivates the account, revokes all sessions, and emails a cancellation
    link valid for 30 days. The user cannot log in during this period.

    Returns:
        202 Accepted
    """
    try:
        user = UserService.get_current_user()
        raw_token = UserService.request_deletion(str(user.id))

        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        support_email = current_app.config.get("MAIL_DEFAULT_SENDER", "support@kayakplanner.app")
        cancel_url = f"{frontend_url}/cancel-deletion?token={raw_token}"

        send_template_email(
            user.mail,
            "Your Kayak Planner account deletion request",
            "deletion_request",
            name=user.name,
            cancel_url=cancel_url,
            support_email=support_email,
        )

        return "", HTTPStatus.ACCEPTED

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="User not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/me/deletion-request", methods=["DELETE"])
def cancel_deletion():
    """
    Cancel a pending account deletion using the emailed token.
    No authentication required — the token is the credential.

    Query param:
        token: raw DELETION_CANCEL token from the cancellation email

    Returns:
        200 on success
        400 if token is invalid / expired / already used
    """
    token = request.args.get("token", "").strip()
    if not token:
        abort(HTTPStatus.BAD_REQUEST, description="token query parameter is required")

    try:
        UserService.cancel_deletion(token)
        return jsonify({"message": "Account deletion cancelled. You can log in again."}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="User not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_admin()
def delete(id: str):
    """
    Admin-only: immediately hard-delete a user account, bypassing the grace period.

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
