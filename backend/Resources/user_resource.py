from http import HTTPStatus
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
from Api.features import require_medical_notes
from Api.limiter import limiter
from Models.auth_token import AuthTokenType
from Tasks.data_export import export_user_data
from Services.mail_service import send_template_email

logger = logging.getLogger(__name__)

USER_ENDPOINT = "/api/v1/user"
user_api = Blueprint('user', __name__, url_prefix=USER_ENDPOINT)

# Client-supplied crypto material. The server validates that the fields are
# present and non-empty and nothing more — it cannot tell a real ciphertext from a
# plausible-looking string, and deliberately holds nothing that would let it try.
_KEYPAIR_FIELDS = ("publicKey", "privateKeyCiphertext", "privateKeyNonce", "privateKeySalt")
_SEALED_FIELDS = ("ciphertext", "nonce", "salt")


@user_api.route("/me", methods=["GET"])
@JWTService.authenticate_restful
def get_me():
    """
    Retrieve the profile of the currently authenticated user.

    Returns:
        JSON response with the user object and 200 status code
    ---
    get:
      summary: Get the authenticated user's profile
      responses:
        200:
          description: The current user
          content:
            application/json:
              schema: UserSchema
        404:
          description: Authenticated user not found
    """
    try:
        user = UserService.get_current_user()
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


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
    ---
    get:
      summary: Search users by email prefix for trip invitations
      parameters:
        - name: q
          in: query
          required: true
          schema:
            type: string
          description: Search string, minimum 2 characters
      responses:
        200:
          description: Matching users, projected to a minimal invite-picker shape
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      format: uuid
                    name:
                      type: string
                    surname:
                      type: string
                      nullable: true
                    mail:
                      type: string
                      format: email
                    avatarUrl:
                      type: string
                      nullable: true
        400:
          description: Search query is missing or shorter than 2 characters
    """
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        abort(HTTPStatus.BAD_REQUEST, description="Search query must be at least 2 characters")

    users = UserService.search_users(query)
    schema = UserSchema(only=("id", "name", "surname", "mail", "avatar_url"))
    return jsonify(schema.dump(users, many=True)), HTTPStatus.OK


@user_api.route("/search/paddlers", methods=["GET"])
@JWTService.authenticate_restful
@limiter.limit("30 per minute", key_func=lambda: str(g.current_user_id))
def search_paddlers():
    """Buddy finder — search public paddlers by username / name / surname.

    Query params: q (search term), page, per_page. Returns a paginated, block-filtered
    list of public profiles, each annotated with the caller's relationship
    (none | pending_outgoing | pending_incoming | buddy) and connection id.
    ---
    get:
      summary: Search public paddlers (buddy finder)
      description: >
        Rate limited to 30 requests per minute per user. Excludes the caller and
        anyone blocked in either direction. An empty `q` returns an empty page.
      parameters:
        - name: q
          in: query
          required: false
          schema:
            type: string
        - name: page
          in: query
          required: false
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          required: false
          schema:
            type: integer
            default: 20
          description: Capped at 100
      responses:
        200:
          description: A page of public profiles, each annotated with id, relationship, and connectionId
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: PublicUserSchema
                  total:
                    type: integer
                  page:
                    type: integer
                  pages:
                    type: integer
    """
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


@user_api.route("/<string:username>/public", methods=["GET"])
@JWTService.authenticate_optional
def get_public_profile(username: str):
    """
    Retrieve a paddler's public profile by username. Auth-optional (mirrors
    GET /api/itinerary/explore): anonymous and authenticated callers both allowed.

    Returns a privacy-safe projection (identity, bio, home location, opt-in
    certifications, aggregate stats). Returns a single 404 for a missing, inactive,
    deletion-pending, or non-public profile — no existence oracle.
    ---
    get:
      summary: Get a paddler's public profile by username
      description: >
        Auth-optional — anonymous and authenticated callers are both allowed.
        Undifferentiated 404 for missing, inactive, deletion-pending, or non-public
        profiles to avoid an existence oracle.
      responses:
        200:
          description: The public profile, with an aggregate stats object attached
          content:
            application/json:
              schema:
                allOf:
                  - PublicUserSchema
                  - type: object
                    properties:
                      stats:
                        type: object
                        description: Aggregate logbook stats (distance, hours, endorsements, activity history)
        404:
          description: Profile not found
    """
    try:
        viewer_id = getattr(g, "current_user_id", None)
        user = UserService.get_public_profile(username, viewer_id)
        data = PublicUserSchema().dump(user)
        data["stats"] = LogService.stats_for_user(str(user.id))
        return jsonify(data), HTTPStatus.OK

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Profile not found")


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
    ---
    get:
      summary: Get a user's full profile by id
      description: Only the user themselves may retrieve their own full profile.
      responses:
        200:
          description: The user
          content:
            application/json:
              schema: UserSchema
        403:
          description: Caller is not this user
        404:
          description: User not found
    """
    try:
        user = UserService.get_user_by_id(id)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")


@user_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_self()
def update_user(id: str):
    """
    Partially update a user's profile (name, surname, phone, username, and other
    profile fields).

    Only fields present in the request body are applied. Email changes require
    a dedicated verification flow and are not accepted here. Password changes
    are not accepted here either — use PATCH /api/v1/user/me/password, which
    verifies the current password and revokes other sessions.

    Args:
        id: UUID of the user to update

    Returns:
        JSON response with the updated user object and 200 status code

    Raises:
        400: If validation fails
        404: If the user does not exist
        409: If a unique constraint is violated
    ---
    patch:
      summary: Partially update a user's profile
      description: Only the user themselves may update their own profile. Omitted fields are left unchanged.
      requestBody:
        content:
          application/json:
            schema: UserUpdateSchema
      responses:
        200:
          description: The updated user
          content:
            application/json:
              schema: UserSchema
        400:
          description: Validation failed
        403:
          description: Caller is not this user
        404:
          description: User not found
        409:
          description: A unique constraint (e.g. username) was violated
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
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description=f"Error updating user with id {id}")


@user_api.route("/me/password", methods=["PATCH"])
@JWTService.authenticate_restful
def change_password():
    """
    ---
    patch:
      summary: Change the authenticated user's password
      description: >
        currentPwd/newPwd prove identity and set the new password hash — that part is
        unavoidable and unrelated to the medical-notes scheme. If the account has an X25519
        keypair, the client must also derive both password-keys locally, decrypt the private
        key under currentPwd and re-encrypt it under newPwd, and post the result here
        (privateKeyCiphertext/privateKeyNonce/privateKeySalt); the server stores those three
        opaque strings verbatim and never re-derives or re-wraps the key itself (M22).
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - currentPwd
                - newPwd
              properties:
                currentPwd:
                  type: string
                newPwd:
                  type: string
                privateKeyCiphertext:
                  type: string
                  description: Required if the account has a keypair; the private key re-wrapped under newPwd.
                privateKeyNonce:
                  type: string
                privateKeySalt:
                  type: string
      responses:
        204:
          description: Password changed
        400:
          description: >
            currentPwd/newPwd missing, currentPwd is incorrect, or the account has a keypair
            and no rewrapped private key was supplied
        404:
          description: Authenticated user not found
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        current_pwd = raw.get("currentPwd")
        new_pwd = raw.get("newPwd")
        if not current_pwd or not new_pwd:
            abort(HTTPStatus.BAD_REQUEST, description="currentPwd and newPwd are required")
        UserService.change_password(
            str(g.current_user_id),
            current_pwd,
            new_pwd,
            raw.get("privateKeyCiphertext"),
            raw.get("privateKeyNonce"),
            raw.get("privateKeySalt"),
        )
        return "", HTTPStatus.NO_CONTENT
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/keypair", methods=["POST"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def store_keypair():
    """
    ---
    post:
      summary: Store a client-generated X25519 keypair for the authenticated user
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth) —
        that is what establishes the caller is the account holder, since no password is
        sent. The client generates the keypair and wraps the private key under a
        password-derived key before posting it (M22); the server stores four opaque
        strings. Conflicts (409) rather than overwriting an existing keypair, which
        would orphan every note encrypted under it.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - publicKey
                - privateKeyCiphertext
                - privateKeyNonce
                - privateKeySalt
              properties:
                publicKey:
                  type: string
                privateKeyCiphertext:
                  type: string
                privateKeyNonce:
                  type: string
                privateKeySalt:
                  type: string
      responses:
        200:
          description: Keypair stored
          content:
            application/json:
              schema:
                type: object
                properties:
                  hasKeypair:
                    type: boolean
        400:
          description: A required field is missing
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found
        409:
          description: Keypair already exists
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        missing = [
            field for field in _KEYPAIR_FIELDS if not raw.get(field)
        ]
        if missing:
            abort(HTTPStatus.BAD_REQUEST, description=f"{', '.join(missing)} required")
        UserService.store_keypair(
            str(g.current_user_id),
            raw["publicKey"],
            raw["privateKeyCiphertext"],
            raw["privateKeyNonce"],
            raw["privateKeySalt"],
        )
        return jsonify({"hasKeypair": True}), HTTPStatus.OK
    except ValueError:
        abort(HTTPStatus.CONFLICT, description="Keypair already exists")
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/keypair", methods=["GET"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def get_keypair():
    """
    ---
    get:
      summary: Get the authenticated user's own keypair
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth).
        Returns the public key and the password-wrapped private key. The client unwraps
        the private key in memory to decrypt its own notes and any crew notes shared
        with it as leader (M22); the wrapping password is never sent to the server.
      responses:
        200:
          description: The caller's own keypair
          content:
            application/json:
              schema:
                type: object
                properties:
                  publicKey:
                    type: string
                  privateKeyCiphertext:
                    type: string
                  privateKeyNonce:
                    type: string
                  privateKeySalt:
                    type: string
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found, or no keypair stored
    """
    try:
        return jsonify(UserService.get_keypair(str(g.current_user_id))), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/re-auth", methods=["POST"])
@JWTService.authenticate_restful
@limiter.limit("10 per minute", key_func=lambda: str(g.current_user_id))
def re_auth():
    """
    ---
    post:
      summary: Re-authenticate with password to obtain a short-lived elevated token
      description: >
        Rate limited to 10 requests per minute per user. The elevated token (5 minute
        TTL) is required via the X-Elevated-Token header on sensitive endpoints like
        medical-consent and email-change.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - password
              properties:
                password:
                  type: string
      responses:
        200:
          description: Elevated token issued
          content:
            application/json:
              schema:
                type: object
                properties:
                  elevatedToken:
                    type: string
        400:
          description: password is missing
        401:
          description: Password is incorrect
        404:
          description: Authenticated user not found
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict) or "password" not in raw:
            abort(HTTPStatus.BAD_REQUEST, description="password is required")
        if not UserService.verify_password(str(g.current_user_id), raw["password"]):
            abort(HTTPStatus.UNAUTHORIZED, description="Password incorrect")
        token = JWTService.generate_elevated_token(str(g.current_user_id))
        return jsonify({"elevatedToken": token}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/email-change", methods=["POST"])
@JWTService.authenticate_restful
@JWTService.require_elevated_token
@limiter.limit("5 per minute", key_func=lambda: str(g.current_user_id))
def request_email_change():
    """
    ---
    post:
      summary: Request a change of the authenticated user's email address
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth).
        Rate limited to 5 requests per minute per user. Sends a verification link to
        the new address; the change is not applied until confirmed via GET
        /api/v1/auth/verify-email-change. If the address already belongs to another
        account, this silently no-ops (still returns 202) to avoid an enumeration
        oracle.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - newMail
              properties:
                newMail:
                  type: string
                  format: email
      responses:
        202:
          description: Verification email sent (or silently no-opped if the address is taken)
        400:
          description: newMail is missing, malformed, or matches the current address
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict) or not raw.get("newMail"):
            abort(HTTPStatus.BAD_REQUEST, description="newMail is required")
        UserService.request_email_change(str(g.current_user_id), raw["newMail"].strip())
        return "", HTTPStatus.ACCEPTED
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/medical-consent", methods=["POST"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def grant_medical_consent():
    """
    ---
    post:
      summary: Store the authenticated user's client-encrypted medical notes
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth).
        The client encrypts under a key derived from the user's password and posts the
        sealed triple (M22) — the plaintext and the password never leave the device.
        Records a consent timestamp.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - ciphertext
                - nonce
                - salt
              properties:
                ciphertext:
                  type: string
                nonce:
                  type: string
                salt:
                  type: string
      responses:
        200:
          description: The updated user
          content:
            application/json:
              schema: UserSchema
        400:
          description: A required field is missing
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        missing = [field for field in _SEALED_FIELDS if not raw.get(field)]
        if missing:
            abort(HTTPStatus.BAD_REQUEST, description=f"{', '.join(missing)} required")
        user = UserService.grant_medical_consent(
            str(g.current_user_id), raw["ciphertext"], raw["nonce"], raw["salt"]
        )
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/medical-consent", methods=["DELETE"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def revoke_medical_consent():
    """
    ---
    delete:
      summary: Revoke medical-notes consent and erase stored notes
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth).
        GDPR Art. 7(3): clears the notes from both the User record and every
        TripMember row for this user.
      responses:
        204:
          description: Consent revoked and notes erased
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found
    """
    try:
        UserService.revoke_medical_consent(str(g.current_user_id))
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/medical-notes", methods=["GET"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def get_medical_notes():
    """
    ---
    get:
      summary: Retrieve the authenticated user's sealed medical notes
      description: >
        Requires an elevated token (X-Elevated-Token header, see POST .../me/re-auth).
        Returns the ciphertext for the client to decrypt with a key derived from the
        user's password (M22). A GET since the change — the password no longer travels
        in a body, so there is nothing left to hide from a URL. All three fields are
        null when no notes have been stored yet, which is a state, not an error.
      responses:
        200:
          description: The sealed notes, or nulls if none are stored
          content:
            application/json:
              schema:
                type: object
                properties:
                  ciphertext:
                    type: string
                    nullable: true
                  nonce:
                    type: string
                    nullable: true
                  salt:
                    type: string
                    nullable: true
        403:
          description: Elevated token missing, invalid, or expired
        404:
          description: Authenticated user not found
    """
    try:
        return jsonify(UserService.get_medical_notes(str(g.current_user_id))), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/avatar", methods=["POST"])
@JWTService.authenticate_restful
def upload_avatar():
    """
    Upload or replace the avatar for the authenticated user.

    Expects a multipart/form-data request with a 'file' field.
    Accepted MIME types: image/jpeg, image/png, image/webp, image/gif, image/avif.
    Size limits: minimum 512 B, maximum 5 MB.

    Returns:
        JSON response with the updated user object and 200 status code

    Raises:
        400: If no file is provided or the file fails validation
    ---
    post:
      summary: Upload or replace the authenticated user's avatar
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - file
              properties:
                file:
                  type: string
                  format: binary
      responses:
        200:
          description: The updated user
          content:
            application/json:
              schema: UserSchema
        400:
          description: No file provided, or the file fails validation (type/size)
        404:
          description: Authenticated user not found
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


@user_api.route("/me/avatar", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_avatar():
    """
    Remove the avatar for the authenticated user.

    Returns:
        204 No Content on success
    ---
    delete:
      summary: Remove the authenticated user's avatar
      responses:
        204:
          description: Avatar removed
        404:
          description: Authenticated user not found
    """
    try:
        UserService.delete_avatar(str(g.current_user_id))
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/banner", methods=["POST"])
@JWTService.authenticate_restful
def upload_banner():
    """
    Upload or replace the profile banner for the authenticated user.

    Expects a multipart/form-data request with a 'file' field.
    Accepted MIME types: image/jpeg, image/png, image/webp, image/gif, image/avif.
    Size limits: minimum 512 B, maximum 8 MB.

    Returns:
        JSON response with the updated user object and 200 status code

    Raises:
        400: If no file is provided or the file fails validation
    ---
    post:
      summary: Upload or replace the authenticated user's profile banner
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - file
              properties:
                file:
                  type: string
                  format: binary
      responses:
        200:
          description: The updated user
          content:
            application/json:
              schema: UserSchema
        400:
          description: No file provided, or the file fails validation (type/size)
        404:
          description: Authenticated user not found
    """
    if "file" not in request.files:
        abort(HTTPStatus.BAD_REQUEST, description="No file provided")

    file = request.files["file"]
    if not file.filename:
        abort(HTTPStatus.BAD_REQUEST, description="File has no name")

    try:
        file_bytes = file.read()
        user = UserService.upload_banner(str(g.current_user_id), file_bytes, file.filename)
        return jsonify(UserSchema().dump(user)), HTTPStatus.OK

    except StorageValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


@user_api.route("/me/banner", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_banner():
    """
    Remove the profile banner for the authenticated user.

    Returns:
        204 No Content on success
    ---
    delete:
      summary: Remove the authenticated user's profile banner
      responses:
        204:
          description: Banner removed
        404:
          description: Authenticated user not found
    """
    try:
        UserService.delete_banner(str(g.current_user_id))
        return "", HTTPStatus.NO_CONTENT

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Authenticated user not found")


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
    ---
    post:
      summary: Request a GDPR data export
      description: Rate limited to 1 request per day per user. Queues a Celery task; an email with a one-time download link (24h TTL) follows.
      responses:
        202:
          description: Export queued
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
    ---
    get:
      summary: Download a queued GDPR data export
      description: >
        No authentication required — the single-use token from the emailed link is
        the credential. The export file is deleted after this download.
      responses:
        200:
          description: The export as a downloadable JSON attachment
          content:
            application/json: {}
        400:
          description: Token is invalid, expired, or already used
        404:
          description: Export file not found (already downloaded, or the export task has not finished yet)
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
    ---
    delete:
      summary: Begin the GDPR account-erasure grace period
      description: >
        Deactivates the account, revokes all sessions, and emails a cancellation
        link valid for 30 days. The user cannot log in during this period; if the
        grace period elapses without cancellation, erasure proceeds.
      responses:
        202:
          description: Deletion grace period started
        404:
          description: Authenticated user not found
    """
    try:
        user = UserService.get_current_user()
        raw_token = UserService.request_deletion(str(user.id))

        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        cancel_url = f"{frontend_url}/cancel-deletion?token={raw_token}"

        send_template_email(
            user.mail,
            "Your Kayaktrek account deletion request",
            "deletion_request",
            name=user.name,
            cancel_url=cancel_url,
        )

        return "", HTTPStatus.ACCEPTED

    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="User not found")


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
    ---
    delete:
      summary: Cancel a pending account deletion
      description: No authentication required — the emailed token is the credential.
      parameters:
        - name: token
          in: query
          required: true
          schema:
            type: string
          description: Raw DELETION_CANCEL token from the cancellation email
      responses:
        200:
          description: Deletion cancelled
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        400:
          description: token is missing, invalid, expired, or already used
        404:
          description: User not found
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
    ---
    delete:
      summary: Admin hard-delete a user account
      description: Bypasses the GDPR grace period — immediate, irreversible deletion.
      responses:
        204:
          description: User deleted
        403:
          description: Caller is not an admin
        404:
          description: User not found
        409:
          description: References prevent deletion
    """
    try:
        UserService.delete_user(id)
        return "", HTTPStatus.NO_CONTENT
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"User with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description=f"Error deleting user with id {id}")
