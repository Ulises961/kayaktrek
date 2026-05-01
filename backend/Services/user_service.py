from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from cryptography.exceptions import InvalidTag
from flask import g
from flask_bcrypt import check_password_hash, generate_password_hash

from sqlalchemy.exc import NoResultFound, IntegrityError
import uuid_extension
import logging

from Models.user import User
from Models.trip_member import TripMember
from Api.database import db
from Schemas.base_schema import camelcase
from Services.crypto_service import encrypt, decrypt
from Services.storage_service import StorageService

logger = logging.getLogger(__name__)


class UserService:
    _MUTABLE_FIELDS = frozenset({
        "username", "name", "surname", "phone",
        "vessel_make", "vessel_model", "vessel_length_cm",
        "vessel_color_primary", "vessel_color_secondary",
        "emergency_contact_name", "emergency_contact_phone",
        "emergency_contact_relationship",
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

        Raises:
            NoResultFound: If user does not exist
            ValueError: If current password does not match
        """
        user = UserService.get_user_by_id(id)
        if not check_password_hash(user.pwd, current_pwd):
            raise ValueError("Current password is incorrect")
        user.pwd = generate_password_hash(new_pwd).decode("UTF-8")
        db.session.commit()
        logger.info("password_changed", extra={"user_id": id})

    @staticmethod
    def verify_password(id: str, password: str) -> bool:
        """Return True if the given password matches the stored hash."""
        user = UserService.get_user_by_id(id)
        return check_password_hash(user.pwd, password)

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
        db.session.query(TripMember).filter_by(user_id=user.id).update({
            "medical_notes": None,
            "medical_notes_consent_at": None,
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
                user.medical_notes_nonce,
                user.medical_notes_salt,
                password,
            )
        except InvalidTag:
            raise ValueError("Decryption failed — password may be incorrect")

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
