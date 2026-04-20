"""
Itinerary Service - Business logic for itinerary operations.
"""
import logging
from typing import List, Optional, cast
from uuid import UUID
from sqlalchemy.exc import NoResultFound, IntegrityError
from sqlalchemy.orm import selectinload
from Models.user_has_itinerary import user_has_itinerary
from Models.itinerary import Itinerary
from Models.user import User
from Schemas.base_schema import camelcase
from Schemas.itinerary_shema import ItinerarySchema
from Models.day import Day
from Schemas.day_schema import DaySchema
from Api.database import db

logger = logging.getLogger(__name__)


class ItineraryService:
    """Service class for Itinerary-related business logic."""
    _MUTABLE_FIELDS = frozenset({"is_public", "total_miles", "expected_total_miles"})

    @staticmethod
    def get_itinerary_by_id(itinerary_id: str) -> Itinerary:
        """
        Retrieve an itinerary by its public ID.

        Args:
            itinerary_id: The public ID of the itinerary to retrieve

        Returns:
            Itinerary object if found

        Raises:
            NoResultFound: If itinerary doesn't exist
        """
        itinerary = db.session.query(Itinerary).options(selectinload(Itinerary.days)).filter_by(id=UUID(itinerary_id)).first()
        if not itinerary:
            logger.warning(f"Itinerary with id {itinerary_id} not found")
            raise NoResultFound(f"Itinerary {itinerary_id} not found in database")
        return itinerary

    @staticmethod
    def get_itineraries_by_user(user_id: str) -> List[Itinerary]:
        """
        Retrieve all itineraries for a user.

        Args:
            user_id: The ID of the user

        Returns:
            List of Itinerary objects
        """
        user = db.session.query(User).options(selectinload(User.itineraries)).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User with id {user_id} not found in db")
        
        logger.info(f"Found {len(user.itineraries)} itineraries for user {user_id}")

        return user.itineraries

    @staticmethod
    def create_itinerary(itinerary_data: dict) -> Itinerary:
        """
        Create a new itinerary.

        Args:
            itinerary_data: Dictionary containing itinerary information

        Returns:
            Created Itinerary object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new itinerary")
        itinerary = cast(Itinerary, ItinerarySchema().load(itinerary_data))
        db.session.add(itinerary)
        db.session.commit()

        db.session.refresh(itinerary)
        logger.info(f"Itinerary {itinerary.id} created successfully")
        return itinerary

    @staticmethod
    def update_itinerary(id: str, itinerary_data: dict) -> Itinerary:
        """
        Update an existing itinerary.

        Args:
            itinerary_id: The ID of the itinerary to update
            itinerary_data: Dictionary containing itinerary information

        Returns:
            Updated Itinerary object

        Raises:
            ValidationError: If data is invalid
            NoResultFound: If itinerary doesn't exist
            IntegrityError: If database constraints are violated
        """
        # Verify itinerary exists
        existing_itinerary = ItineraryService.get_itinerary_by_id(id)

        if not existing_itinerary:
            raise NoResultFound(f"Itinerary with id {id} not found")

        if existing_itinerary.is_public:
            raise PermissionError("Public itineraries are read-only. Clone it to make changes.")

        logger.info(f"Updating itinerary {id}")

        try:
            for field in ItineraryService._MUTABLE_FIELDS:
                key = camelcase(field)
                if key in itinerary_data:
                    setattr(existing_itinerary, field, itinerary_data[key])

            if "days" in itinerary_data:
                for day in list(existing_itinerary.days):
                    db.session.delete(day)
                db.session.flush()

                for day_data in (itinerary_data["days"] or []):
                    day = cast(Day, DaySchema().load(day_data))
                    day.itinerary_id = existing_itinerary.id
                    existing_itinerary.days.append(day)
                logger.info(f"Replaced days: {len(itinerary_data['days'] or [])} new days")

            db.session.commit()
            db.session.refresh(existing_itinerary)

            logger.info(f"Itinerary {id} updated successfully")
            return existing_itinerary

        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error updating itinerary {id}: {e}")
            raise

    @staticmethod
    def delete_itinerary(id: str) -> None:
        """
        Delete an itinerary by its ID.

        Args:
            itinerary_id: The ID of the itinerary to delete

        Raises:
            NoResultFound: If itinerary doesn't exist
            IntegrityError: If itinerary has references that prevent deletion
        """
        itinerary = ItineraryService.get_itinerary_by_id(id)

        try:
            logger.info(f"Deleting itinerary {id}")
            db.session.delete(itinerary)
            db.session.commit()
            logger.info(f"Itinerary {id} deleted successfully")

        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting itinerary {id}: {e}")
            raise IntegrityError(
                f"Cannot delete itinerary {id} due to existing references",
                params=None,
                orig=e
            )
