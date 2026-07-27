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
    """
    UserCertificationResource GET method. Lists the caller's own certifications.
    ---
    get:
      summary: List the caller's certifications
      responses:
        200:
          description: The caller's certifications
          content:
            application/json:
              schema:
                type: array
                items: UserCertificationSchema
        404:
          description: User not found
    """
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
    """
    UserCertificationResource POST method. Adds a certification to the caller's profile.

    Requires a fresh `X-Elevated-Token` (re-authentication) in addition to the bearer token.
    ---
    post:
      summary: Add a certification to the caller's profile
      requestBody:
        content:
          application/json:
            schema: UserCertificationSchema
      responses:
        201:
          description: The created certification
          content:
            application/json:
              schema: UserCertificationSchema
        403:
          description: Missing, invalid, or mismatched elevated token
        404:
          description: User not found
        422:
          description: Validation error
    """
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
    """
    UserCertificationResource PATCH method. Updates one of the caller's certifications.

    Requires a fresh `X-Elevated-Token` (re-authentication) in addition to the bearer token.
    ---
    patch:
      summary: Update a certification
      requestBody:
        content:
          application/json:
            schema: UserCertificationSchema
      responses:
        200:
          description: The updated certification
          content:
            application/json:
              schema: UserCertificationSchema
        403:
          description: Missing, invalid, or mismatched elevated token
        404:
          description: Certification not found
        422:
          description: Validation error
    """
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
    """
    UserCertificationResource DELETE method. Removes one of the caller's certifications.

    Requires a fresh `X-Elevated-Token` (re-authentication) in addition to the bearer token.
    ---
    delete:
      summary: Delete a certification
      responses:
        204:
          description: Certification deleted
        403:
          description: Missing, invalid, or mismatched elevated token
        404:
          description: Certification not found
    """
    try:
        UserCertificationService.delete_certification(g.current_user_id, cert_id)
        return "", HTTPStatus.NO_CONTENT
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Certification not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
