from datetime import date
from http import HTTPStatus
from typing import Any, Dict, cast
from werkzeug.exceptions import HTTPException
import logging
from sqlalchemy.exc import IntegrityError, NoResultFound
from flask import Blueprint, abort, g, jsonify, request
from marshmallow import ValidationError
from Schemas.trip_schema import TripSchema, TripUpdateSchema
from Schemas.trip_member_schema import TripMemberSchema, TripMemberUpdateSchema
from Schemas.medical_notes_access_log_schema import MedicalNotesAccessLogSchema
from Api.features import require_medical_notes
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner, require_leader
from Services.trip_change_service import TripChangeService
from Services.trip_service import TripService
from Services.trip_member_service import TripMemberService
from Services.trip_leadership_service import TripLeadershipService

logger = logging.getLogger(__name__)

TRIP_ENDPOINT = "/api/v1/trip"
trip_api = Blueprint("trip", __name__, url_prefix=TRIP_ENDPOINT)

# Client-supplied crypto material — see the same constants in user_resource.py.
# A member's own notes are sealed with a password-derived key (salt); the leader's copy
# is sealed with ECIES, which carries an ephemeral public key instead.
_SEALED_FIELDS = ("ciphertext", "nonce", "salt")
_LEADER_SEALED_FIELDS = ("ciphertext", "nonce", "ephemeralKey")


@trip_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip")
def get_trip(id: str):
    """
    TripResource GET method. Retrieves trip by id.

    Returns:
        JSON response with trip data and 200 status code
    ---
    get:
      summary: Get a trip by id
      description: >
        Medical notes are redacted for non-leader travellers. `changeRev` is the revision of
        the trip's change log at the moment of the read — what a client polls
        GET /live/trip/<id>/changes from — or null when the log could not be reached.
      responses:
        200:
          description: The trip
          content:
            application/json:
              schema: TripSchema
        404:
          description: Trip not found
    """
    try:
        logger.info(f"Retrieving trip with id {id}")
        # Before the data, so a change committed in between is reported by the first poll
        # from this revision rather than lost to the gap.
        change_rev = TripChangeService.current_revision(id)
        trip = TripService.get_trip_by_id(id)
        TripService.touch_last_accessed(trip)
        data: Dict[str, Any] = cast(dict, TripSchema().dump(trip))
        data["changeRev"] = change_rev

        current_user_id = str(g.current_user_id)
        is_leader = any(
            str(t.get("user", {}).get("id")) == current_user_id and t.get("role") == "leader"
            for t in data.get("travellers", [])
        )
        if not is_leader:
            for t in data.get("travellers", []):
                if str(t.get("user", {}).get("id")) != current_user_id:
                    t["medicalNotes"] = None
                    t["medicalNotesConsentAt"] = None

        return jsonify(data), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:user_id>/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_user_trips(user_id: str):
    """
    TripResource GET method. Retrieves a paginated, filterable page of a user's trips.

    Query params: page, per_page (capped 100); state (building|happening|past);
    difficulty (easy|moderate|demanding|expert); sort (soonest|latest|latest_end,
    default newest-created); min_miles/max_miles (itinerary total distance).

    Returns:
        JSON response with trip data and 200 status code
    ---
    get:
      summary: Get a paginated, filterable page of a user's trips
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: state
          in: query
          schema:
            type: string
            enum: [building, happening, past, archived]
        - name: difficulty
          in: query
          schema:
            type: string
            enum: [easy, moderate, demanding, expert]
        - name: sort
          in: query
          description: Defaults to newest-created when omitted.
          schema:
            type: string
            enum: [soonest, latest, latest_end]
        - name: min_miles
          in: query
          schema:
            type: number
        - name: max_miles
          in: query
          schema:
            type: number
      responses:
        200:
          description: A page of the user's trips
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: TripSchema
                  total:
                    type: integer
                  page:
                    type: integer
                  pages:
                    type: integer
        400:
          description: Invalid filter/sort value
        403:
          description: The path user_id does not match the authenticated caller
    """
    if str(g.current_user_id) != user_id:
        abort(HTTPStatus.FORBIDDEN, description="Access denied")
    try:
        logger.info(f"Retrieving all trips for user with id {user_id}")
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        result = TripService.get_trips_by_user(
            user_id,
            page=page,
            per_page=per_page,
            state=request.args.get("state"),
            difficulty=request.args.get("difficulty"),
            sort=request.args.get("sort"),
            min_miles=request.args.get("min_miles", type=float),
            max_miles=request.args.get("max_miles", type=float),
        )
        schema = TripSchema()
        return jsonify({
            "items": [schema.dump(trip) for trip in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "pages": result["pages"],
        }), HTTPStatus.OK

    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:user_id>/invitations", methods=["GET"])
@JWTService.authenticate_restful
def get_all_user_invitations(user_id: str):
    """
    TripResource GET method. Retrieves trip(s) by ID or all trips.

    Returns:
        JSON response with trip data and 200 status code
    ---
    get:
      summary: List a user's pending trip invitations
      responses:
        200:
          description: The user's pending invitations
          content:
            application/json:
              schema:
                type: array
                items: TripSchema
        403:
          description: The path user_id does not match the authenticated caller
    """
    if str(g.current_user_id) != user_id:
        abort(HTTPStatus.FORBIDDEN, description="Access denied")
    try:
        logger.info(f"Retrieving trip with id {id}")
        trips = TripService.get_invitations_by_user(user_id)
        return jsonify([TripSchema().dump(trip) for trip in trips]), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip with id {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def post():
    """
    TripResource POST method. Adds a new trip to the database.

    Returns:
        JSON response with created trip and 201 status code
    ---
    post:
      summary: Create a trip
      description: The caller becomes the trip's leader.
      requestBody:
        content:
          application/json:
            schema: TripSchema
      responses:
        201:
          description: The created trip
          content:
            application/json:
              schema: TripSchema
    """
    try:
        trip_data = request.get_json()
        trip = TripService.create_trip(trip_data)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.CREATED
    except HTTPException:
        raise
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.exception(f"Error creating trip: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@trip_api.route("/<string:id>/state", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def transition_state(id: str):
    """
    Transition a trip's state forward (draft → planning → happening → past).

    Returns:
        JSON response with updated trip and 200 status code
    ---
    post:
      summary: Advance a trip's state forward
      description: >
        Leader-only, forward-only. Valid values are building, happening, past,
        archived; a transition is only allowed to the state machine's next step
        from the trip's current state.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                state:
                  type: string
                  enum: [building, happening, past, archived]
              required:
                - state
      responses:
        200:
          description: The updated trip
          content:
            application/json:
              schema: TripSchema
        400:
          description: "'state' missing, an invalid value, or not the next valid step from the trip's current state"
        404:
          description: Trip not found
    """
    try:
        body = request.get_json()
        new_state = body.get("state") if body else None
        if not new_state:
            abort(HTTPStatus.BAD_REQUEST, description="'state' field is required")
        trip = TripService.transition_trip_state(id, new_state)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Trip {id} not found")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/pause", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def pause_trip(id: str):
    """
    POST /api/trip/<id>/pause — Leader pauses a happening expedition.

    Returns 200 with the updated trip, 409 if not happening or already paused.
    ---
    post:
      summary: Pause a happening expedition
      responses:
        200:
          description: The updated trip
          content:
            application/json:
              schema: TripSchema
        404:
          description: Trip not found
        409:
          description: The trip is not in the happening state, or is already paused
    """
    try:
        trip = TripService.pause_trip(id)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/resume", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def resume_trip(id: str):
    """
    POST /api/trip/<id>/resume — Leader resumes a paused expedition.

    Body: {"resumeDate"?: "YYYY-MM-DD"} — defaults to today. Every Day after the
    pause date shifts forward by the resulting gap; date_to extends to match.
    Returns 200 with the updated trip, 400 for a malformed date, 409 if not
    paused or resumeDate precedes the pause date.
    ---
    post:
      summary: Resume a paused expedition
      description: >
        Every Day after the pause date shifts forward by the resulting gap;
        date_to extends to match.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                resumeDate:
                  type: string
                  format: date
                  description: Defaults to today.
      responses:
        200:
          description: The updated trip
          content:
            application/json:
              schema: TripSchema
        400:
          description: resumeDate is not a valid ISO 8601 date
        404:
          description: Trip not found
        409:
          description: The trip is not paused, or resumeDate precedes the pause date
    """
    try:
        body = request.get_json(silent=True) or {}
        resume_date_raw = body.get("resumeDate")
        try:
            resume_date = date.fromisoformat(resume_date_raw) if resume_date_raw else None
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="resumeDate must be an ISO 8601 date")
        trip = TripService.resume_trip(id, resume_date)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/abort", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def abort_trip(id: str):
    """
    POST /api/trip/<id>/abort — Leader ends a paused expedition early.

    Returns 200 with the updated trip (state=past, outcome=interrupted),
    409 if the trip is not happening and paused.
    ---
    post:
      summary: End a paused expedition early
      description: Sets state=past and outcome=interrupted.
      responses:
        200:
          description: The updated trip
          content:
            application/json:
              schema: TripSchema
        404:
          description: Trip not found
        409:
          description: The trip is not happening and paused
    """
    try:
        trip = TripService.abort_trip(id)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("trip")
def update_trip(id: str):
    """
    PATCH /api/trip/<id> — Partially update an existing trip.

    Accepts a JSON body with any subset of mutable trip fields
    (destination, description, dateFrom, dateTo).
    Only the fields present in the body are applied; omitted fields are left unchanged.
    State transitions must go through POST /api/trip/<id>/state instead.

    Returns:
        200 with the updated trip object, or 404 if not found.
    ---
    patch:
      summary: Partially update a trip
      description: >
        Only fields present in the body are applied. State transitions must go
        through POST /<id>/state instead.
      requestBody:
        content:
          application/json:
            schema: TripUpdateSchema
      responses:
        200:
          description: The updated trip
          content:
            application/json:
              schema: TripSchema
        400:
          description: Validation error
        404:
          description: Trip not found
    """
    try:
        raw = request.get_json()
        stored_trip = TripService.get_trip_by_id(id, eager=False)
        validated = TripUpdateSchema(stored_trip=stored_trip).load(raw)
        assert isinstance(validated, dict)
        trip_data = {**raw, **validated}
        trip = TripService.update_trip(id, trip_data)
        return jsonify(TripSchema().dump(trip)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@trip_api.route("/<string:id>/invite", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def invite_user(id: str):
    """
    POST /api/trip/<id>/invite — Leader invites a user to the trip.

    Body: {"userId": "<uuid>"} — sourced from the buddy picker or paddler search, never
    a blind email/username guess, which would be an enumeration oracle. A block in
    either direction between leader and invitee forbids the invitation (403).
    Returns 201, 404 if no account found, 409 if already invited or member.
    ---
    post:
      summary: Invite a user to the trip
      description: >
        userId must be sourced from the buddy picker or paddler search, never a
        blind email/username guess. A block in either direction between leader
        and invitee forbids the invitation.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                userId:
                  type: string
              required:
                - userId
      responses:
        201:
          description: Invitation sent
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        400:
          description: "'userId' is required"
        403:
          description: A block exists between the leader and the invitee
        404:
          description: No account found for userId
        409:
          description: The user is already invited or already a member
    """
    try:
        body = request.get_json() or {}
        user_id = body.get("userId")
        inviter_id = str(g.current_user_id)
        if user_id:
            TripService.invite_user(id, user_id, inviter_id=inviter_id)
        else:
            abort(HTTPStatus.BAD_REQUEST, description="'userId' is required")
        return jsonify({"message": "Invitation sent"}), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/invite/<string:invitee_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def cancel_invitation(id: str, invitee_id: str):
    """
    DELETE /api/trip/<id>/invite/<invitee_id> — Leader cancels a pending invitation.

    Returns 200 on success, 404 if no pending invitation exists.
    ---
    delete:
      summary: Cancel a pending invitation
      responses:
        200:
          description: Invitation cancelled
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: No pending invitation exists
    """
    try:
        TripService.cancel_invitation(id, invitee_id)
        return jsonify({"message": "Invitation cancelled"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/invitation", methods=["POST"])
@JWTService.authenticate_restful
def handle_invitation(id: str):
    """
    POST /api/trip/<id>/invitation — Current user accepts or declines their invitation.

    Body: {"accepted": true | false}
    Returns 200 on success, 404 if no valid invitation found.
    ---
    post:
      summary: Accept or decline the caller's own invitation
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                accepted:
                  type: boolean
              required:
                - accepted
      responses:
        200:
          description: Invitation accepted or declined
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        400:
          description: "'accepted' field is required"
        404:
          description: No valid invitation found
    """
    try:
        body = request.get_json()
        if body is None or "accepted" not in body:
            abort(HTTPStatus.BAD_REQUEST, description="'accepted' field is required")
        TripService.handle_invitation(id, bool(body["accepted"]))
        action = "accepted" if body["accepted"] else "declined"
        return jsonify({"message": f"Invitation {action}"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/<string:user_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def remove_member(id: str, user_id: str):
    """
    DELETE /api/trip/<id>/member/<user_id> — Leader removes a crew member from the trip.

    Returns 200 on success, 404 if user is not a member, 409 if target is the leader.
    ---
    delete:
      summary: Remove a crew member from the trip
      responses:
        200:
          description: Member removed
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: User is not a member of this trip
        409:
          description: Cannot remove the trip leader
    """
    try:
        TripService.remove_member(id, user_id)
        return jsonify({"message": "Member removed"}), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me", methods=["GET"])
@JWTService.authenticate_restful
def get_my_membership(id: str):
    """
    GET /api/trip/<id>/member/me — Get the caller's own membership/float-plan record.
    ---
    get:
      summary: Get the caller's own trip membership
      responses:
        200:
          description: The caller's membership record
          content:
            application/json:
              schema: TripMemberSchema
        404:
          description: You are not a member of this trip
    """
    try:
        membership = TripMemberService.get_my_membership(id)
        return jsonify(TripMemberSchema().dump(membership)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me", methods=["PATCH"])
@JWTService.authenticate_restful
def update_my_float_plan(id: str):
    """
    PATCH /api/trip/<id>/member/me — Update the caller's own float-plan fields
    (vessel and emergency contact details). Medical notes are managed via the
    dedicated consent endpoints below, not this route.
    ---
    patch:
      summary: Update the caller's own float-plan fields
      requestBody:
        content:
          application/json:
            schema: TripMemberUpdateSchema
      responses:
        200:
          description: The updated membership record
          content:
            application/json:
              schema: TripMemberSchema
        400:
          description: Request body is not a JSON object, or a validation error
        404:
          description: You are not a member of this trip
    """
    try:
        raw = request.get_json(silent=True, force=True) or {}
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        validated = cast(dict, TripMemberUpdateSchema().load(raw))
        membership = TripMemberService.update_my_float_plan(id, validated)
        return jsonify(TripMemberSchema().dump(membership)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except HTTPException:
        raise
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/medical-notes", methods=["GET"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def get_trip_medical_notes(id: str):
    """
    GET /api/trip/<id>/member/me/medical-notes — Return the caller's own sealed trip
    medical notes for their client to decrypt. Requires an elevated (re-authenticated)
    token.
    ---
    get:
      summary: Get the caller's own sealed trip medical notes
      description: >
        Since M22 the server returns ciphertext and the client decrypts it with a key
        derived from the user's password. All three fields are null when nothing has
        been stored yet.
      responses:
        200:
          description: The sealed medical notes, or nulls if none are stored
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
          description: You are not a member of this trip
    """
    try:
        return jsonify(TripMemberService.get_trip_medical_notes(id)), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/medical-consent", methods=["POST"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def set_trip_medical_notes(id: str):
    """
    POST /api/trip/<id>/member/me/medical-consent — Encrypt and store the
    caller's own trip medical notes. Requires an elevated (re-authenticated) token.
    ---
    post:
      summary: Store the caller's own client-encrypted trip medical notes
      description: >
        Since M22 the client encrypts under a key derived from the user's password and
        posts the sealed triple; the plaintext and the password never leave the device.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                ciphertext:
                  type: string
                nonce:
                  type: string
                salt:
                  type: string
              required:
                - ciphertext
                - nonce
                - salt
      responses:
        200:
          description: The updated membership record
          content:
            application/json:
              schema: TripMemberSchema
        400:
          description: A required field is missing
        404:
          description: You are not a member of this trip
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        missing = [field for field in _SEALED_FIELDS if not raw.get(field)]
        if missing:
            abort(HTTPStatus.BAD_REQUEST, description=f"{', '.join(missing)} required")
        membership = TripMemberService.set_trip_medical_notes(
            id, raw["ciphertext"], raw["nonce"], raw["salt"]
        )
        return jsonify(TripMemberSchema().dump(membership)), HTTPStatus.OK
    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/medical-consent", methods=["DELETE"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def revoke_trip_medical_notes(id: str):
    """
    DELETE /api/trip/<id>/member/me/medical-consent — Clear the caller's own
    stored trip medical notes. Requires an elevated (re-authenticated) token.
    ---
    delete:
      summary: Clear the caller's own trip medical notes
      responses:
        200:
          description: The updated membership record
          content:
            application/json:
              schema: TripMemberSchema
        404:
          description: You are not a member of this trip
    """
    try:
        membership = TripMemberService.revoke_trip_medical_notes(id)
        return jsonify(TripMemberSchema().dump(membership)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/leader-public-key", methods=["GET"])
@JWTService.authenticate_restful
def get_leader_public_key(id: str):
    """
    GET /api/trip/<id>/member/me/leader-public-key — The trip leader's X25519 public
    key, so a crew member's client can seal its notes for the leader itself.
    ---
    get:
      summary: Get the trip leader's public key
      description: >
        Public key material only — no elevated token, since nothing here is secret. The
        gate is membership of the trip.
      responses:
        200:
          description: The leader's public key
          content:
            application/json:
              schema:
                type: object
                properties:
                  publicKey:
                    type: string
        400:
          description: The leader has not set up their encryption keypair yet
        404:
          description: You are not a member of this trip
    """
    try:
        return jsonify({"publicKey": TripMemberService.get_leader_public_key(id)}), HTTPStatus.OK
    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/share-medical-notes", methods=["POST"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def share_medical_notes(id: str):
    """
    POST /api/trip/<id>/member/me/share-medical-notes — Store the leader-readable copy
    of the caller's own trip medical notes, ECIES-sealed on the client to the leader's
    public key. Requires an elevated (re-authenticated) token.
    ---
    post:
      summary: Share the caller's own trip medical notes with the trip leader
      description: >
        Since M22 the client fetches the leader's public key (GET
        .../member/me/leader-public-key), seals the notes locally and posts the blob.
        The server never holds the plaintext.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                ciphertext:
                  type: string
                nonce:
                  type: string
                ephemeralKey:
                  type: string
              required:
                - ciphertext
                - nonce
                - ephemeralKey
      responses:
        200:
          description: The updated membership record
          content:
            application/json:
              schema: TripMemberSchema
        400:
          description: A required field is missing, no trip medical notes are stored, or the leader has not set up their keypair yet
        404:
          description: You are not a member of this trip
    """
    try:
        raw = request.get_json()
        if not isinstance(raw, dict):
            abort(HTTPStatus.BAD_REQUEST, description="Request body must be a JSON object")
        missing = [field for field in _LEADER_SEALED_FIELDS if not raw.get(field)]
        if missing:
            abort(HTTPStatus.BAD_REQUEST, description=f"{', '.join(missing)} required")
        membership = TripMemberService.share_medical_notes(
            id, raw["ciphertext"], raw["nonce"], raw["ephemeralKey"]
        )
        return jsonify(TripMemberSchema().dump(membership)), HTTPStatus.OK
    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/<string:member_id>/medical-notes", methods=["GET"])
@require_medical_notes
@JWTService.authenticate_restful
@JWTService.require_elevated_token
def read_member_medical_notes(id: str, member_id: str):
    """
    GET /api/trip/<id>/member/<member_id>/medical-notes — The leader-sealed copy of a
    crew member's shared trip medical notes, for the leader's own client to decrypt.
    Requires an elevated (re-authenticated) token.
    ---
    get:
      summary: Get a crew member's shared trip medical notes, sealed to the leader
      description: >
        Leader-only. Since M22 the leader's client unwraps its own private key and
        decrypts locally, so the server hands over ciphertext and never sees the notes.
        Records an access-log entry (ADR-023) — since the decrypt now happens on the
        device, that entry marks the leader taking possession of the ciphertext rather
        than a proven-successful decrypt.
      responses:
        200:
          description: The sealed medical notes
          content:
            application/json:
              schema:
                type: object
                properties:
                  ciphertext:
                    type: string
                  nonce:
                    type: string
                  ephemeralKey:
                    type: string
        403:
          description: Only the trip leader can read shared medical notes
        404:
          description: Member not found in this trip, or the member has no shared medical notes, or the leader keypair is missing
    """
    try:
        sealed = TripMemberService.read_shared_medical_notes(id, member_id)
        return jsonify(sealed), HTTPStatus.OK
    except HTTPException:
        raise
    except PermissionError:
        abort(HTTPStatus.FORBIDDEN, description="Only the trip leader can read shared medical notes")
    except ValueError as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Member not found in this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/me/medical-notes/access-log", methods=["GET"])
@require_medical_notes
@JWTService.authenticate_restful
def get_medical_notes_access_log(id: str):
    """Who has read the caller's own shared medical notes on this trip, and when.
    Metadata only (no notes content), so — unlike the decrypt endpoints above — this
    does not require an elevated token.
    ---
    get:
      summary: Get the access log for the caller's own shared medical notes
      responses:
        200:
          description: The access log entries, newest first
          content:
            application/json:
              schema:
                type: array
                items: MedicalNotesAccessLogSchema
        404:
          description: You are not a member of this trip
    """
    try:
        logs = TripMemberService.get_medical_notes_access_log(id)
        return jsonify(MedicalNotesAccessLogSchema(many=True).dump(logs)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="You are not a member of this trip")
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def delete(id: str):
    """
    TripResource DELETE method. Leader-only — deletes the trip for everyone.

    Returns:
        Success message and 200 status code
    ---
    delete:
      summary: Delete a trip for everyone
      description: Leader-only. Cascades to the trip's itinerary, inventory, and logistics.
      responses:
        200:
          description: Deletion successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Trip not found
    """
    try:
        TripService.delete_trip_for_everyone(id)
        return {"message": "Deletion successful"}, HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/leave", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
def leave(id: str):
    """
    Remove the caller's own membership from the trip. Any member (leader or
    crew) may call this. If the leader leaves and crew remain, the trip
    survives with no leader (see POST /<id>/claim-leadership).

    Returns:
        Success message and 200 status code
    ---
    post:
      summary: Leave a trip
      description: >
        Removes the caller's own membership. If the leader leaves and crew
        remain, the trip survives with no leader (see POST /<id>/claim-leadership).
      responses:
        200:
          description: Left trip
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Trip not found
    """
    try:
        TripService.leave_trip(id)
        return {"message": "Left trip"}, HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/member/<string:user_id>/nominate-successor", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def nominate_successor(id: str, user_id: str):
    """Leader designates a crew member as the trip's successor.
    ---
    post:
      summary: Nominate a crew member as the trip's successor
      description: >
        Whoever is nominated becomes the only member allowed to claim leadership
        if the leader leaves (see POST /<id>/claim-leadership).
      responses:
        200:
          description: The nominated member's membership record
          content:
            application/json:
              schema: TripMemberSchema
        400:
          description: Cannot nominate the current leader as their own successor
        404:
          description: user_id is not a member of this trip
    """
    try:
        member = TripLeadershipService.nominate_successor(id, user_id)
        return jsonify(TripMemberSchema().dump(member)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/nominate-successor", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("trip")
@require_leader()
def clear_successor_nomination(id: str):
    """Leader clears whichever member is currently nominated (no-op if none).
    ---
    delete:
      summary: Clear the trip's successor nomination
      description: No-op if no member is currently nominated.
      responses:
        200:
          description: Nomination cleared
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
    """
    try:
        TripLeadershipService.clear_nomination(id)
        return {"message": "Nomination cleared"}, HTTPStatus.OK
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@trip_api.route("/<string:id>/claim-leadership", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip")
def claim_leadership(id: str):
    """
    A crew member claims leadership of a trip that currently has none. If a
    successor was nominated, only they may claim; otherwise first-come-first-serve.

    Returns 409 if the trip already has a leader or is archived, 403 if a
    different successor was nominated.
    ---
    post:
      summary: Claim leadership of a leaderless trip
      description: >
        If a successor was nominated, only they may claim; otherwise
        first-come-first-served among crew members.
      responses:
        200:
          description: The caller's updated membership record
          content:
            application/json:
              schema: TripMemberSchema
        403:
          description: A different successor was nominated
        404:
          description: Trip not found, or the caller is not a member of this trip
        409:
          description: The trip already has a leader, or is archived
    """
    try:
        member = TripLeadershipService.claim_leadership(id)
        return jsonify(TripMemberSchema().dump(member)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

