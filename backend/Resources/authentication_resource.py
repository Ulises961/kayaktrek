import hmac
import logging
from uuid import UUID

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
from Services.session_service import SessionService
from Services.user_service import UserService
from Services.Utils.client_identity import resolve_device_label, resolve_location_label
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
    """
    ---
    post:
      summary: Log in
      description: Identify by `mail` or `username` (at least one required), plus `pwd`.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [pwd]
              properties:
                mail:
                  type: string
                  format: email
                username:
                  type: string
                pwd:
                  type: string
                  format: password
      responses:
        200:
          description: Access + refresh token pair
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  message:
                    type: string
                  access_token:
                    type: string
                  refresh_token:
                    type: string
        401:
          description: Invalid credentials
        403:
          description: Account not active, or deletion pending
    """
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
            session = SessionService.start(
                user.id,
                device_label=resolve_device_label(request.headers.get("User-Agent")),
                location_label=resolve_location_label(),
            )
            access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin, user.token_version, str(session.id))
            refresh_token = JWTService.generate_refresh_token(str(user.id), user.token_version, session.token_version, str(session.id))

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


def _invite_code_valid(submitted: str) -> bool:
    required = current_app.config.get("INVITE_CODE") or ""
    if not required:
        return True
    return hmac.compare_digest(str(submitted or ""), required)


@api.route("/api/v1/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register_user():
    """
    ---
    post:
      summary: Register
      description: >
        Always returns 201, even if the mail/username is already taken — prevents account
        enumeration. Sends a verification email; the account is inactive until verified.
        When the closed-beta invite gate is enabled (INVITE_CODE set), a missing or wrong
        `inviteCode` returns 403 before any of that — this check is independent of the
        enumeration guard, since a shared code carries no per-user information.


        Accepts four optional fields beyond UserSchema — `publicKey`,
        `privateKeyCiphertext`, `privateKeyNonce`, `privateKeySalt` — the medical-notes
        keypair the client generates and wraps under the user's password (M22). Omit all
        four to register without one and add it later via POST /api/v1/user/me/keypair.
      requestBody:
        content:
          application/json:
            schema: UserSchema
      responses:
        201:
          description: Request received (does not imply an account was actually created)
        403:
          description: Missing or invalid invite code
    """
    user_json = request.get_json()

    if not user_json:
        raise ValueError("Missing request body")

    if not _invite_code_valid(user_json.get("inviteCode")):
        return jsonify({
            "status": "fail",
            "code": "invalid_invite_code",
            "message": "Invalid or missing invite code.",
        }), HTTPStatus.FORBIDDEN

    AuthService.register_user(user_json)

    return jsonify({
        "status": "success",
        "message": "Request received. If this address is new, check your email to verify your account.",
    }), HTTPStatus.CREATED


@api.route("/api/v1/auth/activate-test", methods=["POST"])
def activate_test_user():
    """Bypass email verification for E2E tests. Only available in development/testing.
    ---
    post:
      summary: Activate a user without email verification (dev/testing only)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [mail]
              properties:
                mail:
                  type: string
                  format: email
      responses:
        200:
          description: Activated
        404:
          description: Not found (also returned outside development/testing)
    """
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
    """
    ---
    get:
      summary: Verify an account via the emailed token
      parameters:
        - name: token
          in: query
          required: true
          schema:
            type: string
      responses:
        200:
          description: Account activated
        400:
          description: Missing or invalid/expired token
    """
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


@api.route("/api/v1/auth/verify-email-change", methods=["GET"])
def verify_email_change():
    """
    ---
    get:
      summary: Confirm a pending email address change via the emailed token
      parameters:
        - name: token
          in: query
          required: true
          schema:
            type: string
      responses:
        200:
          description: Email address updated
        400:
          description: Missing or invalid/expired token
    """
    token = request.args.get("token")
    if not token:
        abort(HTTPStatus.BAD_REQUEST, description="Missing token")
    try:
        user = AuthService.verify_email_change(token)
        return jsonify({"status": "success", "message": "Email address updated", "mail": user.mail}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(e)
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Email change verification failed")


@api.route("/api/v1/auth/resend-verification", methods=["POST"])
@limiter.limit("3 per hour", key_func=_resend_key)
def resend_verification():
    """
    ---
    post:
      summary: Resend the account verification email
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [mail]
              properties:
                mail:
                  type: string
                  format: email
      responses:
        200:
          description: Verification email sent
        404:
          description: No account with that email address
    """
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
    """
    ---
    post:
      summary: Resend the deletion-cancellation email
      description: >
        No-oracle: always 200, whether or not the account exists or has a pending deletion.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [mail]
              properties:
                mail:
                  type: string
                  format: email
      responses:
        200:
          description: Sent, if applicable
    """
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    try:
        result = UserService.resend_deletion_cancel(data["mail"])
        if result:
            raw_token, user_name = result
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            cancel_url = f"{frontend_url}/cancel-deletion?token={raw_token}"
            send_template_email(
                data["mail"],
                "Your Kayaktrek account deletion request",
                "deletion_request",
                name=user_name,
                cancel_url=cancel_url,
            )
        # Always return 200 — do not reveal whether the account exists
        return jsonify({"message": "If an account with that email has a pending deletion, a new cancellation link has been sent."}), HTTPStatus.OK
    except Exception as e:
        logger.error("resend_deletion_cancel_failed", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description="Could not resend cancellation email")


@api.route("/api/v1/auth/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    """
    ---
    post:
      summary: Request a password-reset email
      description: No-oracle — always 200, whether or not the address is registered.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [mail]
              properties:
                mail:
                  type: string
                  format: email
      responses:
        200:
          description: Sent, if applicable
    """
    data = request.get_json()
    if not data or not data.get("mail"):
        abort(HTTPStatus.BAD_REQUEST, description="Missing mail")
    # Always 200 — do not reveal whether the address is registered
    AuthService.request_password_reset(data["mail"])
    return jsonify({"status": "success", "message": "If that address is registered, a reset link has been sent"}), HTTPStatus.OK


@api.route("/api/v1/auth/reset-password", methods=["POST"])
def reset_password():
    """
    ---
    post:
      summary: Reset a password using the emailed token
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [token, pwd]
              properties:
                token:
                  type: string
                pwd:
                  type: string
                  format: password
      responses:
        200:
          description: Password updated
        400:
          description: Missing fields, or invalid/expired token
    """
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
@limiter.limit("10 per minute")
def refresh_token():
    """
    ---
    post:
      summary: Rotate a refresh token for a new access + refresh token pair
      description: >
        Refresh tokens rotate on every use; presenting an already-used one is treated as a
        theft signal and revokes every outstanding session for that user.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [refresh_token]
              properties:
                refresh_token:
                  type: string
      responses:
        200:
          description: New access + refresh token pair
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  access_token:
                    type: string
                  refresh_token:
                    type: string
        400:
          description: Missing refresh token
        401:
          description: Invalid, expired, or reused token
        403:
          description: Account not active
    """
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

    try:
        session = AuthService.rotate_session(user, payload, location_label=resolve_location_label())
    except ValueError as e:
        abort(HTTPStatus.UNAUTHORIZED, description=str(e))

    access_token = JWTService.generate_access_token(str(user.id), user.mail, user.admin, user.token_version, str(session.id))
    refresh_token = JWTService.generate_refresh_token(str(user.id), user.token_version, session.token_version, str(session.id))

    return jsonify({
        "status": "success",
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), HTTPStatus.OK


@api.route("/api/v1/auth/logout", methods=["POST"])
@JWTService.authenticate_restful
def logout():
    """
    ---
    post:
      summary: Log out this device
      description: >
        Revokes only the session this token belongs to; the user's other devices stay
        signed in. Use /auth/logout-all to end every session.
      responses:
        200:
          description: Logged out
    """
    session = SessionService.get_usable(str(g.current_session_id), UUID(str(g.current_user_id)))
    if session:
        SessionService.revoke(session, reason="user_logout")
    return jsonify({"status": "success", "message": "Logged out"}), HTTPStatus.OK


@api.route("/api/v1/auth/logout-all", methods=["POST"])
@JWTService.authenticate_restful
def logout_all():
    """
    ---
    post:
      summary: Log out everywhere
      description: >
        Bumps token_version and revokes every session, invalidating every outstanding
        access/refresh token on all of the user's devices.
      responses:
        200:
          description: Logged out everywhere
    """
    try:
        UserService.invalidate_sessions(str(g.current_user_id))
    except NoResultFound:
        abort(HTTPStatus.UNAUTHORIZED)
    return jsonify({"status": "success", "message": "Logged out everywhere"}), HTTPStatus.OK
