import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from cryptography.exceptions import InvalidTag
from flask import g
from flask_bcrypt import check_password_hash, generate_password_hash

from sqlalchemy import and_, or_
from sqlalchemy.exc import NoResultFound, IntegrityError
from sqlalchemy.orm import selectinload
import uuid_extension
import logging

from Models.user import User
from Models.trip_member import TripMember
from Models.block import Block
from Models.connection import Connection, ConnectionStatusType
from Api.database import db
from Schemas.base_schema import camelcase
from Schemas.user_schema import PublicUserSchema
from Services.crypto_service import encrypt, decrypt, generate_keypair
from Services.storage_service import StorageService
from Models.auth_token import AuthToken, AuthTokenType
from Services.auth_service import AuthService
from Services.block_service import BlockService
from Services.session_service import SessionService

logger = logging.getLogger(__name__)


class UserService:
    # Same pattern UserSchema.validate_mail uses — kept in sync deliberately.
    _MAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

    _MUTABLE_FIELDS = frozenset({
        "username", "name", "surname", "phone",
        "vessel_make", "vessel_model", "vessel_length_cm",
        "vessel_color_primary", "vessel_color_secondary",
        "emergency_contact_name", "emergency_contact_phone",
        "emergency_contact_relationship",
        "bio", "home_location", "profile_is_public",
        "unit_preference",
    })

    @staticmethod
    def get_user_by_id(id: str) -> User:
        """
        Retrieve a user by their ID.

        Args:
            id: UUID string of the user

        Returns:
            User object if found

        Raises:
            NoResultFound: If no user with that ID exists
        """
        user: Optional[User] = db.session.query(User).filter_by(id=UUID(id)).first()
        if not user:
            raise NoResultFound(f"User with id {id} not found in db")
        return user

    @staticmethod
    def get_current_user() -> User:
        """
        Retrieve the user identified by the active JWT (g.current_user_id).

        Returns:
            User object for the authenticated caller

        Raises:
            NoResultFound: If the user no longer exists
        """
        return UserService.get_user_by_id(str(g.current_user_id))

    @staticmethod
    def search_users(query: str, limit: int = 20) -> List[User]:
        """
        Search active users by email prefix (case-insensitive).
        Excludes the calling user from results.

        Args:
            query: Search string
            limit: Maximum number of results to return

        Returns:
            List of matching User objects
        """
        # TODO M7: add a GIN index using pg_trgm on users.mail for efficient
        # case-insensitive substring search once community discovery is needed.
        # Migration: CREATE INDEX ix_users_mail_trgm ON users USING GIN (mail gin_trgm_ops);
        pattern = f"{query}%"
        return (
            db.session.query(User)
            .filter(
                User.id != UUID(str(g.current_user_id)),
                User.active.is_(True),
                User.mail.ilike(pattern),
            )
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_public_profile(username: str, viewer_id: Optional[str] = None) -> User:
        """Resolve a paddler's public profile by username, applying visibility.

        Single choke-point for the public-profile read. Raises NoResultFound — mapped to a
        single 404 by the resource — for ALL of: unknown username, inactive or
        deletion-pending account, or profile_is_public = False. These are deliberately
        indistinguishable to avoid an existence/enumeration oracle.

        `viewer_id` (the optional authenticated caller) is accepted now so M7b can fold a
        block check into this one method without changing the signature or any caller — the
        block-awareness seam. Unused in M7a.

        Raises:
            NoResultFound: If the profile does not exist or is not publicly visible.
        """
        user = db.session.query(User).filter_by(username=username).first()
        if (
            user is None
            or not user.active
            or user.deletion_requested_at is not None
            or not user.profile_is_public
        ):
            raise NoResultFound(f"Public profile for '{username}' is not available")

        # A block in either direction hides the profile — same neutral 404, no oracle.
        if viewer_id is not None and BlockService.block_exists_between(viewer_id, user.id):
            raise NoResultFound(f"Public profile for '{username}' is not available")
        return user

    @staticmethod
    def search_paddlers(
        viewer_id: str, query: str, page: int = 1, per_page: int = 20
    ) -> dict:
        """Search public paddlers by username / name / surname for the buddy finder.

        Only `profile_is_public` users are returned; the caller, anyone the caller
        blocked, and anyone who blocked the caller are excluded. Each row is annotated
        with the caller's relationship (none | pending_outgoing | pending_incoming |
        buddy) and the connection id (when one exists) so the UI renders the right
        action. An empty query returns an empty page rather than the whole directory.

        Returns: {"items": [...], "total": N, "page": P, "pages": P}.
        """
        viewer_uuid = UUID(viewer_id)
        term = (query or "").strip()
        if not term:
            return {"items": [], "total": 0, "page": page, "pages": 1}

        pattern = f"%{term}%"
        blocked = (
            db.session.query(Block.id)
            .filter(
                or_(
                    and_(Block.blocker_id == viewer_uuid, Block.blocked_id == User.id),
                    and_(Block.blocker_id == User.id, Block.blocked_id == viewer_uuid),
                )
            )
            .exists()
        )
        base = db.session.query(User).filter(
            User.profile_is_public.is_(True),
            User.active.is_(True),
            User.deletion_requested_at.is_(None),
            User.id != viewer_uuid,
            or_(
                User.username.ilike(pattern),
                User.name.ilike(pattern),
                User.surname.ilike(pattern),
            ),
            ~blocked,
        )

        total = base.count()
        users = (
            base.options(selectinload(User.certifications))
            .order_by(User.username.asc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        relationship_by_user = UserService._relationships_for(viewer_uuid, users)
        items = []
        for user in users:
            data = PublicUserSchema().dump(user)
            data["id"] = str(user.id)
            data["relationship"], data["connectionId"] = relationship_by_user[user.id]
            items.append(data)

        pages = math.ceil(total / per_page) if total > 0 else 1
        logger.info(
            "paddlers_searched",
            extra={"viewer_id": viewer_id, "total": total, "page": page},
        )
        return {"items": items, "total": total, "page": page, "pages": pages}

    @staticmethod
    def _relationships_for(viewer_uuid: UUID, users: List[User]) -> dict:
        """Map each user id to (relationship, connection_id) relative to the viewer."""
        result: Dict[UUID, tuple] = {user.id: ("none", None) for user in users}
        user_ids = list(result.keys())
        if not user_ids:
            return result

        connections = (
            db.session.query(Connection)
            .filter(
                or_(
                    and_(
                        Connection.requester_id == viewer_uuid,
                        Connection.addressee_id.in_(user_ids),
                    ),
                    and_(
                        Connection.addressee_id == viewer_uuid,
                        Connection.requester_id.in_(user_ids),
                    ),
                )
            )
            .all()
        )
        for connection in connections:
            is_outgoing = connection.requester_id == viewer_uuid
            other_id = connection.addressee_id if is_outgoing else connection.requester_id
            if connection.status is ConnectionStatusType.ACCEPTED:
                relationship = "buddy"
            elif is_outgoing:
                relationship = "pending_outgoing"
            else:
                relationship = "pending_incoming"
            result[other_id] = (relationship, str(connection.id))
        return result

    @staticmethod
    def update_user(id: str, user_data: Dict[str, Any]) -> User:
        """
        Partially update a user's profile fields.

        Only fields listed in _MUTABLE_FIELDS are applied. Password, if present,
        is hashed before being stored. Avatar is managed through dedicated methods.

        Args:
            id: UUID string of the user to update
            user_data: camelCase dict of fields to apply

        Returns:
            Updated User object

        Raises:
            NoResultFound: If the user does not exist
            IntegrityError: If a unique constraint is violated (e.g. duplicate username)
        """
        saved_user = db.session.query(User).filter_by(id=UUID(id)).first()
        if not saved_user:
            raise NoResultFound(f"User with id {id} not found in db")

        try:
            for field in UserService._MUTABLE_FIELDS:
                key = camelcase(field)
                if key in user_data:
                    setattr(saved_user, field, user_data[key])

            if 'pwd' in user_data:
                saved_user.pwd = generate_password_hash(user_data['pwd']).decode("UTF-8")

            db.session.commit()
            db.session.refresh(saved_user)
            return saved_user

        except IntegrityError as e:
            db.session.rollback()
            raise IntegrityError(f"Error while updating user with id {id}: {str(e)}", params=None, orig=e)

    @staticmethod
    def upload_avatar(id: str, file_bytes: bytes, filename: str) -> User:
        """
        Upload a new avatar to object storage and update the user's avatar_url.
        The previous avatar is deleted from storage after the DB is committed.

        Args:
            id: UUID string of the user
            file_bytes: Raw file content from the multipart upload
            filename: Original filename (stored as metadata only)

        Returns:
            Updated User object with the new avatar_url

        Raises:
            NoResultFound: If the user does not exist
            StorageValidationError: If the file fails size or MIME type checks
        """
        user = UserService.get_user_by_id(id)
        old_url = user.avatar_url

        object_key = str(uuid_extension.uuid7())
        url = StorageService.upload(file_bytes, object_key, kind="avatar")

        try:
            user.avatar_url = url
            db.session.commit()
        except Exception:
            try:
                StorageService.delete(object_key, kind="avatar")
            except Exception as cleanup_err:
                logger.error(
                    "Orphaned MinIO avatar object '%s' after DB failure — manual cleanup required. Error: %s",
                    object_key, cleanup_err,
                )
            raise

        if old_url:
            old_key = old_url.split("/avatars/")[-1]
            try:
                StorageService.delete(old_key, kind="avatar")
            except Exception as e:
                logger.error(
                    "Orphaned MinIO avatar 'avatars/%s' after replacement — manual cleanup required. Error: %s",
                    old_key, e,
                )

        db.session.refresh(user)
        return user

    @staticmethod
    def delete_avatar(id: str) -> User:
        """
        Remove a user's avatar from object storage and clear avatar_url.

        Args:
            id: UUID string of the user

        Returns:
            Updated User object with avatar_url set to None

        Raises:
            NoResultFound: If the user does not exist
        """
        user = UserService.get_user_by_id(id)
        old_url = user.avatar_url

        user.avatar_url = None
        db.session.commit()

        if old_url:
            try:
                old_key = old_url.split("/avatars/")[-1]
                StorageService.delete(old_key, kind="avatar")
            except Exception as e:
                logger.error(
                    "Orphaned MinIO avatar after DB delete — manual cleanup required. Error: %s", e,
                )

        db.session.refresh(user)
        return user

    @staticmethod
    def change_password(id: str, current_pwd: str, new_pwd: str) -> None:
        """
        Verify current password then replace with the new one.
        If the user has an X25519 keypair, re-encrypts the private key under the new password.

        Raises:
            NoResultFound: If user does not exist
            ValueError: If current password does not match
        """
        user = UserService.get_user_by_id(id)
        if not check_password_hash(user.pwd, current_pwd):
            raise ValueError("Current password is incorrect")
        user.pwd = generate_password_hash(new_pwd).decode("UTF-8")
        user.password_changed_at = datetime.now(timezone.utc)
        user.token_version += 1
        SessionService.revoke_all_for_user(user.id, reason="password_change")
        if user.public_key:
            private_key_b64 = decrypt(
                user.private_key_ciphertext,  # type: ignore
                user.private_key_nonce,  # type: ignore
                user.private_key_salt,  # type: ignore
                current_pwd,
            )
            pk_ct, pk_nonce, pk_salt = encrypt(private_key_b64, new_pwd)
            user.private_key_ciphertext = pk_ct
            user.private_key_nonce = pk_nonce
            user.private_key_salt = pk_salt
        db.session.commit()
        logger.info("password_changed", extra={"user_id": id})

    @staticmethod
    def generate_keypair_for_user(id: str, password: str) -> "User":
        """
        Generate an X25519 keypair for an existing user without one.
        No-op if the user already has a keypair (returns unchanged user).

        Raises:
            NoResultFound: If user does not exist
            ValueError: If password does not match
        """
        user = UserService.get_user_by_id(id)
        if not check_password_hash(user.pwd, password):
            raise PermissionError("Password is incorrect")
        if user.public_key:
            raise ValueError("keypair_already_exists")
        public_key_b64, pk_ct, pk_nonce, pk_salt = generate_keypair(password)
        user.public_key = public_key_b64
        user.private_key_ciphertext = pk_ct
        user.private_key_nonce = pk_nonce
        user.private_key_salt = pk_salt
        db.session.commit()
        db.session.refresh(user)
        logger.info("keypair_generated", extra={"user_id": id})
        return user

    @staticmethod
    def verify_password(id: str, password: str) -> bool:
        """Return True if the given password matches the stored hash."""
        user = UserService.get_user_by_id(id)
        return check_password_hash(user.pwd, password)

    @staticmethod
    def request_email_change(id: str, new_mail: str) -> None:
        """
        Begin an email-change request: validates the new address, stores it as
        `pending_mail`, invalidates any earlier unconsumed request, and emails a
        confirmation link to the new address (never the current one).

        Silently no-ops (no email, no error) when the address already belongs to
        another account — mirrors AuthService.register_user's existing-user
        handling to avoid an enumeration oracle.

        Raises:
            NoResultFound: If user does not exist
            ValueError: If new_mail is malformed or matches the current address
        """
        user = UserService.get_user_by_id(id)
        if len(new_mail) > 255 or not UserService._MAIL_PATTERN.match(new_mail):
            raise ValueError("Invalid email format")
        if new_mail == user.mail:
            raise ValueError("New email must be different from the current address")

        existing = db.session.query(User).filter_by(mail=new_mail).first()
        if existing:
            logger.info("email_change_requested_for_taken_address", extra={"user_id": id})
            return

        db.session.query(AuthToken).filter_by(
            user_id=user.id,
            type=AuthTokenType.EMAIL_CHANGE,
            used=False,
        ).update({"used": True})
        user.pending_mail = new_mail
        db.session.commit()

        AuthService._send_email_change_confirm(user, new_mail)
        logger.info("email_change_requested", extra={"user_id": id})

    @staticmethod
    def grant_medical_consent(id: str, plaintext: str, password: str) -> User:
        """
        Encrypt medical notes with a user-derived key and record consent timestamp.
        Requires the caller to have already verified their identity (elevated token).

        Raises:
            NoResultFound: If user does not exist
        """
        user = UserService.get_user_by_id(id)
        ciphertext, nonce, salt = encrypt(plaintext, password)
        user.medical_notes_ciphertext = ciphertext
        user.medical_notes_nonce = nonce
        user.medical_notes_salt = salt
        user.medical_notes_consent_at = datetime.now(timezone.utc)
        # Notes have been re-entered — clear any pending "lost on reset" prompt.
        user.medical_notes_reset_at = None
        db.session.commit()
        db.session.refresh(user)
        logger.info("medical_consent_granted", extra={"user_id": id})
        return user

    @staticmethod
    def revoke_medical_consent(id: str) -> None:
        """
        Clear medical notes from the User record and all TripMember rows for this user.
        GDPR Art. 7(3): data cannot be retained after consent withdrawal.

        Raises:
            NoResultFound: If user does not exist
        """
        user = UserService.get_user_by_id(id)
        user.medical_notes_ciphertext = None
        user.medical_notes_nonce = None
        user.medical_notes_salt = None
        user.medical_notes_consent_at = None
        # Explicit opt-out — dismiss any pending "lost on reset" prompt as well.
        user.medical_notes_reset_at = None
        db.session.query(TripMember).filter_by(user_id=user.id).update({
            "medical_notes_ciphertext": None,
            "medical_notes_nonce": None,
            "medical_notes_salt": None,
            "medical_notes_consent_at": None,
            "medical_notes_leader_ciphertext": None,
            "medical_notes_leader_nonce": None,
            "medical_notes_leader_ephemeral_key": None,
        })
        db.session.commit()
        logger.info("medical_consent_revoked", extra={"user_id": id})

    @staticmethod
    def get_medical_notes(id: str, password: str) -> str:
        """
        Decrypt and return medical notes. Requires re-auth password.

        Raises:
            NoResultFound: If user does not exist
            ValueError: If no medical notes are stored or decryption fails
        """
        user = UserService.get_user_by_id(id)
        if not user.medical_notes_ciphertext:
            raise ValueError("No medical notes stored")
        try:
            return decrypt(
                user.medical_notes_ciphertext,
                user.medical_notes_nonce, # type: ignore 
                user.medical_notes_salt, # type: ignore 
                password,
            )
        except InvalidTag:
            raise ValueError("Decryption failed — password may be incorrect")

    @staticmethod
    def request_deletion(id: str) -> str:
        """
        Begin the GDPR erasure grace period for a user.

        Sets deletion_requested_at, deactivates the account, revokes all auth
        tokens (immediate logout), and returns a raw DELETION_CANCEL token so
        the caller can email a cancellation link.

        Raises:
            NoResultFound: If the user does not exist
        """
        user = UserService.get_user_by_id(id)
        user.deletion_requested_at = datetime.now(timezone.utc)
        user.active = False
        user.token_version += 1
        SessionService.revoke_all_for_user(user.id, reason="deletion_requested")
        db.session.query(AuthToken).filter_by(user_id=user.id).delete()
        db.session.commit()

        raw_token = AuthService._create_token(user.id, AuthTokenType.DELETION_CANCEL)
        logger.info("deletion_requested", extra={"user_id": id})
        return raw_token

    @staticmethod
    def cancel_deletion(raw_token: str) -> None:
        """
        Cancel a pending erasure request using the emailed cancellation token.

        Verifies the DELETION_CANCEL token, re-activates the account, and clears
        deletion_requested_at. The user must log in again normally after this.

        Raises:
            ValueError: If the token is invalid, expired, or already used
            NoResultFound: If the user no longer exists
        """

        token = AuthService._consume_token(raw_token, AuthTokenType.DELETION_CANCEL)
        user = db.session.query(User).filter_by(id=token.user_id).first()
        if not user:
            raise NoResultFound("User not found")
        user.deletion_requested_at = None
        user.active = True
        db.session.commit()
        logger.info("deletion_cancelled", extra={"user_id": str(token.user_id)})

    @staticmethod
    def resend_deletion_cancel(mail_addr: str) -> Optional[tuple]:
        """
        Invalidate any existing DELETION_CANCEL tokens and issue a new one.

        Returns (raw_token, user_name) if a pending deletion exists for the
        given email, or None if the email is unknown or has no pending deletion.
        Returning None (rather than raising) prevents account enumeration.
        """
        user = db.session.query(User).filter_by(mail=mail_addr).first()
        if not user or not user.deletion_requested_at:
            return None

        db.session.query(AuthToken).filter_by(
            user_id=user.id,
            type=AuthTokenType.DELETION_CANCEL,
            used=False,
        ).update({"used": True})
        db.session.commit()

        raw_token = AuthService._create_token(user.id, AuthTokenType.DELETION_CANCEL)
        logger.info("deletion_cancel_resent", extra={"user_id": str(user.id)})
        return raw_token, user.name

    @staticmethod
    def invalidate_sessions(id: str) -> None:
        """
        Bump token_version and revoke every one of the user's sessions, instantly
        invalidating all outstanding access and refresh tokens. Used by "sign out
        everywhere" — signing out a single device goes through SessionService.revoke.

        Raises:
            NoResultFound: If the user does not exist
        """
        user = UserService.get_user_by_id(id)
        user.token_version += 1
        db.session.commit()
        SessionService.revoke_all_for_user(user.id, reason="sign_out_everywhere")
        logger.info("sessions_invalidated", extra={"user_id": id})

    @staticmethod
    def delete_user(id: str) -> None:
        """
        Permanently delete a user and clean up their avatar from storage.

        Args:
            id: UUID string of the user to delete

        Raises:
            NoResultFound: If the user does not exist
            IntegrityError: If foreign key constraints prevent deletion
        """
        saved_user = db.session.query(User).filter_by(id=UUID(id)).first()
        if not saved_user:
            raise NoResultFound(f"User with id {id} not found")

        old_url = saved_user.avatar_url

        try:
            db.session.delete(saved_user)
            db.session.commit()
            logger.info("User %s deleted successfully", id)
        except IntegrityError as e:
            db.session.rollback()
            raise IntegrityError(
                f"Cannot delete user {id} due to existing references",
                params=None,
                orig=e,
            )

        if old_url:
            try:
                old_key = old_url.split("/avatars/")[-1]
                StorageService.delete(old_key, kind="avatar")
            except Exception as e:
                logger.error(
                    "Orphaned MinIO avatar after user deletion — manual cleanup required. Error: %s", e,
                )
