from http import HTTPStatus
from sqlalchemy.exc import NoResultFound
from flask import Blueprint, jsonify, current_app, abort

from flask_mail import Message

from Api.mail import mail
from Services.Middleware.auth_middleware import JWTService
from Services.user_service import UserService

dev_api = Blueprint("dev", __name__, url_prefix="/api/dev")


@dev_api.before_request
def dev_only():
    if not current_app.config.get("DEVELOPMENT"):
        abort(HTTPStatus.NOT_FOUND)


@dev_api.route("/test-email", methods=["POST"])
@JWTService.authenticate_restful
def send_test_email():
    try:
        user = UserService.get_current_user()
        msg = Message(
            subject="[Dev] SMTP test",
            recipients=[user.mail],
            body=f"Hi {user.name or 'there'}, SMTP is working correctly.",
        )
        mail.send(msg)
        return jsonify({"message": f"Test email sent to {user.mail}"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
