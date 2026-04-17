import logging

from flask import Blueprint, request, jsonify, abort
from http import HTTPStatus
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound

from Schemas.user_schema import UserSchema
from Services.auth_service import AuthService
from Services.user_service import UserService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)
api = Blueprint("auth", __name__)


@api.route("/api/auth/login", methods=["POST"])
def login_user():
    post_data = request.get_json()
    logger.info(f"Post data {post_data}")

    if not post_data:
        raise ValueError("Missing request body")

    mail = post_data.get("mail", None)
    username = post_data.get("username")
    password = post_data.get("pwd")

    try:
        user = AuthService.authenticate_user(mail, username, password)

        if user:
            access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin)
            refresh_token = JWTService.generate_refresh_token(str(user.id))

            if access_token and refresh_token:
                response_object = {
                    "status": "success",
                    "message": "Successfully logged in",
                    "access_token": access_token,
                    "refresh_token": refresh_token
                }
                return jsonify(response_object), HTTPStatus.OK

        response_object = {
            "status": "fail",
            "message": "Invalid credentials",
        }
        return jsonify(response_object), HTTPStatus.UNAUTHORIZED

    except Exception as e:
        logger.error(e)
        raise e


@api.route("/api/auth/register", methods=["POST"])
def register_user():
    user_json = request.get_json()

    if not user_json:
        raise ValueError("Missing request body")

    user = AuthService.register_user(user_json)

    auth_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin)
    refresh_token = JWTService.generate_refresh_token(str(user.id))

    response_object = {
        "status": "success",
        "message": "Successfully registered.",
        "access_token": auth_token,
        "refresh_token": refresh_token
    }
    return jsonify(response_object), HTTPStatus.CREATED


@api.route("/api/auth/verify", methods=["GET"])
def verify_account():
    token = request.args.get("token")
    if not token:
        abort(HTTPStatus.BAD_REQUEST, description="Missing token")
    try:
        user = AuthService.verify_account(token)
        return jsonify({"status": "success", "message": "Account activated", "user": UserSchema().dump(user)}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(e)
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Verification failed")


@api.route("/api/auth/resend-verification", methods=["POST"])
def resend_verification():
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    try:
        AuthService.resend_verification(data["mail"])
        return jsonify({"status": "success", "message": "Verification email sent"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="No account with that email address")
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(e)
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Could not resend verification")


@api.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    # Always 200 — do not reveal whether the address is registered
    AuthService.request_password_reset(data["mail"])
    return jsonify({"status": "success", "message": "If that address is registered, a reset link has been sent"}), HTTPStatus.OK


@api.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    if not data or not data.get("token") or not data.get("pwd"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing token or pwd")
    try:
        AuthService.reset_password(data["token"], data["pwd"])
        return jsonify({"status": "success", "message": "Password updated"}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(e)
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Password reset failed")


@api.route("/api/auth/refresh", methods=["POST"])
def refresh_token():
    data = request.get_json()
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        abort(HTTPStatus.BAD_REQUEST, description="Missing refresh token")

    data = JWTService.verify_token(refresh_token, "refresh")

    if not data:
        abort(HTTPStatus.UNAUTHORIZED, description="Invalid token")

    try:
        user = UserService.get_user_by_id(data["user_id"])
    except NoResultFound:
        abort(HTTPStatus.UNAUTHORIZED, description="Login attempt with non-existent user")

    access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin)

    response_object = {
        "status": "success",
        "access_token": access_token
    }
    return jsonify(response_object), HTTPStatus.OK
