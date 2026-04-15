"""
Trip Service - Business logic for trip operations.
"""

import logging
from datetime import date
from typing import List, Optional, cast
from flask import g
from sqlalchemy.exc import NoResultFound
from uuid import UUID

from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Models.user import User
from Models.user_has_invitation import user_has_invitation
from Schemas.trip_schema import TripSchema
from Api.database import db
from sqlalchemy.orm import selectinload, contains_eager
from Services.user_service import UserService
logger = logging.getLogger(__name__)


class TripService:
    """Service class for Trip-related business logic."""

    @staticmethod
    def get_trip_by_id(id: str) -> Optional[Trip]:
        """
        Retrieve a trip by its id (UUID).

        Args:
            id: The id of the trip to retrieve

        Returns:
            Trip object if found

        Raises:
            NoResultFound: If trip doesn't exist
        """
        trip = db.session.query(Trip).filter_by(id=UUID(id)).first()
        if not trip:
            logger.warning(f"Trip with id {id} not found")
            raise NoResultFound(f"Trip {id} not found in database")
        return trip

    @staticmethod
    def get_trips_by_user(user_id: str) -> List[Trip]:
        """
        Retrieve all trips from the database.

        Returns:
            List of all Trip objects

        Raises:
            NoResultFound: If no trips exist
        """
        user = (
            db.session.query(User)
            .options(selectinload(User.trips))
            .filter_by(id=UUID(user_id))
            .first()
        )

        if not user:
            raise NoResultFound(f"User with id {user_id} not found")
        
        trips = user.trips
        logger.info(f"Found {len(trips)} trips for user {user_id}")

        return trips

    @staticmethod
    def create_trip(trip_data: dict) -> Trip:
        """
        Create a new trip.

        Args:
            trip_data: Dictionary containing trip information

        Returns:
            Created Trip object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """        
        logger.info(f"Creating new trip")
        
        # Get the integer user ID from the id in g.current_user_id
        current_user = UserService.get_user_by_id(str(g.current_user_id))
        if current_user:
            current_user_id = current_user.id
            
            # Set user_id for inventory and items if present
            if 'inventory' in trip_data and trip_data['inventory'] is not None:
                trip_data['inventory']['user_id'] = current_user_id
                if 'items' in trip_data['inventory']:
                    for item in trip_data['inventory']['items']:
                        if 'user_id' not in item:
                            item['user_id'] = current_user_id
            
            if 'itinerary' in trip_data and trip_data['itinerary'] is not None:
                trip_data['itinerary']['user_id'] = current_user_id
                if 'days' in trip_data['itinerary']:
                    for day in trip_data['itinerary']['days']:
                        if 'user_id' not in day:
                            day['user_id'] = current_user_id
        


        trip: Trip = TripSchema().load(trip_data)  # type: ignore
        db.session.add(trip)
        db.session.flush()  # obtain trip.id before creating membership

        # Add the creator as leader
        if current_user:
            membership = TripMember(
                user_id=current_user.id,
                trip_id=trip.id,
                role=MemberRoleType.LEADER,
            )
            db.session.add(membership)
        db.session.commit()

        # Refresh to get relationships
        db.session.refresh(trip)
        logger.info(f"Trip {trip.id} created successfully")
        return trip

    @staticmethod
    def update_trip(trip_id: str, trip_data: dict) -> Trip:
        """
        Update an existing trip.

        Args:
            trip_data: Dictionary containing trip information with ID

        Returns:
            Updated Trip object

        Raises:
            ValidationError: If data is invalid
            NoResultFound: If trip doesn't exist
        """
                # Verify trip exists
        existing_trip = TripService.get_trip_by_id(trip_id)
        if not existing_trip:
            raise NoResultFound(f"Trip {id} not found")
        
        trip: Trip = TripSchema().load(trip_data)  # type: ignore
        logger.info(f"Updating trip {trip.id}")
        db.session.merge(trip)
        db.session.commit()

        updated_trip = TripService.get_trip_by_id(str(trip.id))
        if not updated_trip:
            raise NoResultFound(f"Trip {trip.id} not found after update")
        logger.info(f"Trip {trip.id} updated successfully")
        return updated_trip

    @staticmethod
    def delete_trip(trip_id: str, for_everyone: bool) -> None:
        """
        Delete a trip by its ID.

        Args:
            trip_id: The ID of the trip to delete
            for_everyone: If True, delete the trip entirely. If False, only remove current user's association.

        Raises:
            NoResultFound: If trip doesn't exist
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()

        if not trip:
            raise NoResultFound(f"Trip with id {trip_id} not found")

        if for_everyone:
            # Delete the entire trip and all associations (cascade should handle user_has_trip)
            logger.info(f"Deleting trip {trip_id} for everyone")
            db.session.delete(trip)
            db.session.commit()
            logger.info(f"Trip {trip_id} deleted successfully")
        else:
            # Only remove the current user's association with the trip
            user_id = g.current_user_id

            membership = (
                db.session.query(TripMember)
                .filter_by(user_id=UUID(user_id), trip_id=UUID(trip_id))
                .first()
            )

            if not membership:
                raise NoResultFound(
                    f"User {user_id} is not associated with trip {trip_id}"
                )

            db.session.delete(membership)
            db.session.commit()

            logger.info(f"Removed user {user_id} from trip {trip_id}")

            # Delete the trip if no users remain (business logic decision)
            # Refresh trip to get updated travellers count
            db.session.refresh(trip)
            if not trip.travellers:
                db.session.delete(trip)
                db.session.commit()
                logger.info(f"Trip {trip_id} had no remaining users and was deleted")

    @staticmethod
    def get_invitations_by_user(
        user_id: str, include_expired: bool = False
    ) -> List[Trip]:
        """
        Retrieve all invitations to trips received by the user

        Args:
            user_id: The ID of the invited user
            include_expired: If False, only return non-expired invitations (default: False)
            include_expired: Include trip invitations that have expired

        Returns:
            List of Trip objects referenced in the invitation
        """
        query = (
            db.session.query(User)
            .join(user_has_invitation, User.id == user_has_invitation.c.user_id)
            .join(Trip, user_has_invitation.c.trip_id == Trip.id)
            .options(contains_eager(User.invitations))
            .filter(User.id == UUID(user_id))
        )

        # Filter by expiration date if requested
        if not include_expired:
            query = query.filter(user_has_invitation.c.expiration_date >= date.today())

        user = query.first()

        if not user:
            raise NoResultFound(f"User {user_id} not found")

        invitations = user.invitations
        logger.info(f"Found {len(invitations)} invitations for user {user_id}")
        return invitations

    @staticmethod
    def transition_trip_state(trip_id: str, new_state_value: str) -> Trip:
        """
        Advance a trip's state forward along the state machine.

        Args:
            trip_id: The ID of the trip
            new_state_value: The target state string (e.g. "planning")

        Returns:
            Updated Trip object

        Raises:
            ValueError: If the state value is invalid or the transition is not allowed
            NoResultFound: If the trip doesn't exist
        """
        try:
            new_state = TripStateType(new_state_value)
        except (ValueError, KeyError, TypeError):
            raise ValueError(f"Invalid state '{new_state_value}'. Valid values: {[s.value for s in TripStateType]}")

        trip = TripService.get_trip_by_id(trip_id)
        if not trip:
            raise NoResultFound(f"Trip {trip_id} not found")
        trip.transition_state(new_state)
        db.session.commit()
        db.session.refresh(trip)
        logger.info(f"Trip {trip_id} transitioned to '{new_state_value}'")
        return trip

    @staticmethod
    def handle_invitation(trip_id: str, accepted: bool) -> None:
        """
        Accept or reject a trip invitation.
        
        Args:
            trip_id: The ID of the trip for the invitation
            accepted: True to accept, False to reject
            
        Raises:
            NoResultFound: If invitation doesn't exist or has expired
        """
        user_id = g.current_user_id
        
        # Query user with the specific invitation (filters by expiration in the join)
        user = (
            db.session.query(User)
            .join(user_has_invitation, User.id == user_has_invitation.c.user_id)
            .join(Trip, user_has_invitation.c.trip_id == Trip.id)
            .options(contains_eager(User.invitations))
            .filter(
                User.id == UUID(user_id),
                Trip.id == UUID(trip_id)
            )
            .first()
        )
        
        if not user:
            raise NoResultFound(f"No invitation found for user {user_id} to trip {trip_id}")
        
        # Check if user.invitations contains the trip (loaded via contains_eager)
        if not user.invitations:
            raise NoResultFound(f"Invitation not found")
        
        trip = user.invitations[0]  # Should only be one trip due to filter
        
        # Get the invitation record to check expiration
        invitation_record = (
            db.session.execute(
                user_has_invitation.select().where(
                    user_has_invitation.c.user_id == user.id,
                    user_has_invitation.c.trip_id == trip_id
                )
            ).first()
        )
        
        if not invitation_record or invitation_record.expiration_date < date.today():
            raise NoResultFound(f"Invitation expired or not found")
        
        if accepted:
            # Remove from invitations and add as crew member
            user.invitations.remove(trip)
            membership = TripMember(
                user_id=user.id,
                trip_id=trip.id,
                role=MemberRoleType.CREW,
            )
            db.session.add(membership)
            logger.info(f"User {user_id} accepted invitation to trip {trip_id}")
        else:
            # Just remove from invitations
            user.invitations.remove(trip)
            logger.info(f"User {user_id} rejected invitation to trip {trip_id}")
        
        db.session.commit()