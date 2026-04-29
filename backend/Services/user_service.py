from typing import Any, Dict, List, Optional
from uuid import UUID

from flask import g
from flask_bcrypt import generate_password_hash

from sqlalchemy.exc import NoResultFound, IntegrityError
import uuid_extension
import logging

from Models.user import User
from Api.database import db
from Schemas.base_schema import camelcase
from Services.storage_service import StorageService

logger = logging.getLogger(__name__)


class UserService:
    _MUTABLE_FIELDS = frozenset({"username", "name", "surname", "phone"})

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
