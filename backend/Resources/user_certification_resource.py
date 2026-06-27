from http import HTTPStatus

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.user_certification_schema import UserCertificationSchema
from Services.user_certification_service import UserCertificationService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

CERT_ENDPOINT = "/api/v1/user/me/certifications"
user_certification_api = Blueprint("user_certification", __name__, url_prefix=CERT_ENDPOINT)


@user_certification_api.route("", methods=["GET"])
@JWTService.authenticate_restful
def list_certifications():
    try:
        certs = UserCertificationService.list_certifications(g.current_user_id)
        return jsonify(UserCertificationSchema(many=True).dump(certs)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="User not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_certification_api.route("", methods=["POST"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def add_certification():
    try:
        cert = UserCertificationService.add_certification(g.current_user_id, request.get_json(silent=True) or {})
        return jsonify(UserCertificationSchema().dump(cert)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="User not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_certification_api.route("/<cert_id>", methods=["PATCH"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def update_certification(cert_id: str):
    try:
        cert = UserCertificationService.update_certification(
            g.current_user_id, cert_id, request.get_json(silent=True) or {}
        )
        return jsonify(UserCertificationSchema().dump(cert)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Certification not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@user_certification_api.route("/<cert_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def delete_certification(cert_id: str):
    try:
        UserCertificationService.delete_certification(g.current_user_id, cert_id)
        return "", HTTPStatus.NO_CONTENT
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Certification not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
