import logging

from flask import Blueprint, request, jsonify, abort, current_app, g
from flask_limiter.util import get_remote_address
from http import HTTPStatus
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Api.limiter import limiter
from Models.user import User
from Schemas.user_schema import UserSchema
from Services.auth_service import AuthService
from Services.mail_service import send_template_email
from Services.user_service import UserService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)
api = Blueprint("auth", __name__)


def _resend_key():
    data = request.get_json(silent=True) or {}
    mail = data.get("mail")
    return mail if mail else get_remote_address()


@api.route("/api/v1/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
@limiter.limit("50 per hour")
def login_user():
    post_data = request.get_json()

    if not post_data:
        raise ValueError("Missing request body")

    mail = post_data.get("mail")
    username = post_data.get("username")
    password = post_data.get("pwd")

    if not password or (not mail and not username):
        return jsonify({"status": "fail", "message": "Invalid credentials"}), HTTPStatus.UNAUTHORIZED

    try:
        user = AuthService.authenticate_user(password, mail_addr=mail, username=username)

        if user:
            access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin, user.token_version)
            refresh_token = JWTService.generate_refresh_token(str(user.id), user.token_version)

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

    except PermissionError as e:
        if str(e) == "deletion_pending":
            return jsonify({"status": "fail", "code": "deletion_pending", "message": "This account is scheduled for deletion."}), HTTPStatus.FORBIDDEN
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except Exception as e:
        logger.error(e)
        raise e


@api.route("/api/v1/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register_user():
    user_json = request.get_json()

    if not user_json:
        raise ValueError("Missing request body")

    AuthService.register_user(user_json)

    return jsonify({
        "status": "success",
        "message": "Request received. If this address is new, check your email to verify your account.",
    }), HTTPStatus.CREATED


@api.route("/api/v1/auth/activate-test", methods=["POST"])
def activate_test_user():
    """Bypass email verification for E2E tests. Only available in development/testing."""
    if not current_app.config.get("DEVELOPMENT") and not current_app.config.get("TESTING"):
        abort(HTTPStatus.NOT_FOUND)
    data = request.get_json(silent=True) or {}
    mail = data.get("mail")
    if not mail:
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    try:
        user = db.session.query(User).filter_by(mail=mail.strip().lower()).first()
        if not user:
            abort(HTTPStatus.NOT_FOUND, description="User not found")
        user.active = True
        db.session.commit()
        return jsonify({"status": "activated"}), HTTPStatus.OK
    except Exception as e:
        logger.error("activate_test_user_failed", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR)


@api.route("/api/v1/auth/verify", methods=["GET"])
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


@api.route("/api/v1/auth/resend-verification", methods=["POST"])
@limiter.limit("3 per hour", key_func=_resend_key)
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


@api.route("/api/v1/auth/resend-deletion-cancel", methods=["POST"])
@limiter.limit("3 per hour", key_func=_resend_key)
def resend_deletion_cancel():
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    try:
        result = UserService.resend_deletion_cancel(data["mail"])
        if result:
            raw_token, user_name = result
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            support_email = current_app.config.get("MAIL_DEFAULT_SENDER", "support@kayakplanner.app")
            cancel_url = f"{frontend_url}/cancel-deletion?token={raw_token}"
            send_template_email(
                data["mail"],
                "Your Kayak Planner account deletion request",
                "deletion_request",
                name=user_name,
                cancel_url=cancel_url,
                support_email=support_email,
            )
        # Always return 200 — do not reveal whether the account exists
        return jsonify({"message": "If an account with that email has a pending deletion, a new cancellation link has been sent."}), HTTPStatus.OK
    except Exception as e:
        logger.error("resend_deletion_cancel_failed", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Could not resend cancellation email")


@api.route("/api/v1/auth/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    # Always 200 — do not reveal whether the address is registered
    AuthService.request_password_reset(data["mail"])
    return jsonify({"status": "success", "message": "If that address is registered, a reset link has been sent"}), HTTPStatus.OK


@api.route("/api/v1/auth/reset-password", methods=["POST"])
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


@api.route("/api/v1/auth/refresh", methods=["POST"])
def refresh_token():
    body = request.get_json()
    raw_refresh = body.get("refresh_token") if body else None
    if not raw_refresh:
        abort(HTTPStatus.BAD_REQUEST, description="Missing refresh token")

    payload = JWTService.verify_token(raw_refresh, "refresh")
    if not payload:
        abort(HTTPStatus.UNAUTHORIZED, description="Invalid token")

    try:
        user = UserService.get_user_by_id(payload["user_id"])
    except NoResultFound:
        abort(HTTPStatus.UNAUTHORIZED, description="User not found")

    if not user.active:
        abort(HTTPStatus.FORBIDDEN, description="Account not active")

    if payload.get("tv") != user.token_version:
        abort(HTTPStatus.UNAUTHORIZED, description="Session invalidated — please log in again")

    access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin, user.token_version)

    return jsonify({"status": "success", "access_token": access_token}), HTTPStatus.OK


@api.route("/api/v1/auth/logout", methods=["POST"])
@JWTService.authenticate_restful
def logout():
    try:
        UserService.invalidate_sessions(str(g.current_user_id))
    except NoResultFound:
        abort(HTTPStatus.UNAUTHORIZED)
    return jsonify({"status": "success", "message": "Logged out"}), HTTPStatus.OK
