from typing import Any, Dict, Optional, cast
from uuid import UUID

from Models.image import Image
from Models.user import User
from Api.database import db
from sqlalchemy.exc import NoResultFound, IntegrityError
from flask_bcrypt import generate_password_hash
import logging

from Schemas.base_schema import camelcase
from Schemas.image_schema import ImageSchema

logger = logging.getLogger(__name__)

class UserService:
    _MUTABLE_FIELDS = frozenset({"username", "name", "surname", "phone"})

    @staticmethod
    def get_user_by_id(id: str) -> User:
        user: Optional[User] = db.session.query(User).filter_by(id=UUID(id)).first()
        if not user:
            raise NoResultFound(f"User with id {id} not found in db")
        return user
    
    @staticmethod
    def update_user(id: str, user_data: Dict[str, Any]) -> User:
        """
        Update an existing user.
        
        Args:
            id: The ID of the user to update
            user_json: Dictionary containing user data to update
            
        Returns:
            Updated User object
            
        Raises:
            NoResultFound: If user doesn't exist
            IntegrityError: If database constraints are violated
        """
        # Verify user exists
        saved_user = db.session.query(User).filter_by(id=UUID(id)).first()
        
        if not saved_user:
            raise NoResultFound(f"User with id {id} not found in db")
        
        try:
            for field in UserService._MUTABLE_FIELDS:
                key = camelcase(field)
                if key in user_data:
                    setattr(saved_user, field, user_data[key])

            # Password requires explicit hashing — not a standard setattr field
            if 'pwd' in user_data:
                saved_user.pwd = generate_password_hash(user_data['pwd']).decode("UTF-8")

            # Profile image is a nullable sub-object
            if 'image' in user_data:
                image_data = user_data.get('image')
                saved_user.image = cast(Image, ImageSchema().load(image_data)) if image_data else None

            db.session.commit()
            
            # Refresh to get latest state from database
            db.session.refresh(saved_user)
            return saved_user
            
        except IntegrityError as e:
            db.session.rollback()
            raise IntegrityError(f"Error while updating user with id {id}: {str(e)}", params=None, orig=e)
        
    @staticmethod
    def delete_user(id: str) -> None:
        """
        Delete a user by ID.
        
        Args:
            id: The ID of the user to delete
            
        Raises:
            NoResultFound: If user doesn't exist
            IntegrityError: If user has foreign key references that prevent deletion
        """
        saved_user = db.session.query(User).filter_by(id=UUID(id)).first()
        if not saved_user:
            raise NoResultFound(f"User with id {id} not found")
        
        try:
            db.session.delete(saved_user)
            db.session.commit()
            logger.info(f"User with id {id} deleted successfully")
            
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting user {id}: {e}")
            raise IntegrityError(
                f"Cannot delete user {id} due to existing references", 
                params=None, 
                orig=e
            )
        except Exception as e:
            db.session.rollback()
            logger.exception(f"Unexpected error deleting user {id}")
            raise