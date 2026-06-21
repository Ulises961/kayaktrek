"""
Trip Service - Business logic for trip operations.
"""

import logging
import math
from datetime import date, timedelta
from typing import List
from flask import g
from sqlalchemy.exc import NoResultFound, IntegrityError
from uuid import UUID

from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Models.invitation import Invitation
from Models.inventory import Inventory
from Models.trip_requirement import TripRequirement
from Api.seed import DEFAULT_TRIP_REQUIREMENTS
from Models.user import User
from Models.travel_document import TravelDocument
from Models.shuttle_vehicle import ShuttleVehicle
from Schemas.trip_member_schema import TripMemberSchema
from Schemas.trip_schema import TripSchema
from Api.database import db
from sqlalchemy.orm import selectinload
from Services.user_service import UserService
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

# Fields a client is permitted to change on an existing trip via PATCH.
# state is excluded — transitions go through transition_trip_state() only.
_MUTABLE_FIELDS = {"destination", "description", "date_from", "date_to", "difficulty"}

_INVITATION_TTL_DAYS = 7


class TripService:
    """Service class for Trip-related business logic."""

    @staticmethod
    def get_trip_by_id(id: str, eager: bool = True) -> Trip:
        """
        Retrieve a trip by its id (UUID).

        Raises:
            NoResultFound: If trip doesn't exist
        """
        query = db.session.query(Trip)
        if eager:
            query = query.options(
                selectinload(Trip.trip_members).selectinload(TripMember.user),
                selectinload(Trip.invitations).selectinload(Invitation.user),
                selectinload(Trip.inventory),
                selectinload(Trip.itinerary),
            )
        trip = query.filter_by(id=UUID(id)).first()
        if not trip:
            logger.warning(f"Trip with id {id} not found")
            raise NoResultFound(f"Trip {id} not found in database")
        return trip

    @staticmethod
    def get_trips_by_user(user_id: str, page: int = 1, per_page: int = 20) -> dict:
        """
        Retrieve a paginated page of trips for a user.

        Raises:
            NoResultFound: If the user does not exist
        Returns:
            {"items": [...], "total": N, "page": P, "pages": P}
        """
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User with id {user_id} not found")

        query = (
            db.session.query(Trip)
            .join(TripMember, TripMember.trip_id == Trip.id)
            .filter(TripMember.user_id == UUID(user_id))
            .options(
                selectinload(Trip.trip_members).selectinload(TripMember.user),
                selectinload(Trip.invitations).selectinload(Invitation.user),
                selectinload(Trip.inventory),
                selectinload(Trip.itinerary),
            )
        )
        total = query.count()
        items = query.offset((page - 1) * per_page).limit(per_page).all()
        pages = math.ceil(total / per_page) if total > 0 else 1
        logger.info(f"Returning {len(items)} of {total} trips for user {user_id} (page {page})")
        return {"items": items, "total": total, "page": page, "pages": pages}

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
        logger.info("Creating new trip")

        current_user = UserService.get_user_by_id(str(g.current_user_id))

        trip: Trip = TripSchema().load(trip_data)
        db.session.add(trip)
        db.session.flush()  # obtain trip.id before creating membership

        # Add the creator as leader, snapshotting their profile vessel/emergency defaults
        membership = None
        if current_user:
            prefill = {}
            for field in (
                "vessel_make", "vessel_model", "vessel_length_cm",
                "vessel_color_primary", "vessel_color_secondary",
                "emergency_contact_name", "emergency_contact_phone",
                "emergency_contact_relationship",
            ):
                value = getattr(current_user, field, None)
                if value is not None:
                    prefill[field] = value

            membership = TripMemberSchema().load({
                'user_id': current_user.id,
                'trip_id': trip.id,
                'role': MemberRoleType.LEADER.value,
                **prefill,
            })
            db.session.add(membership)
            db.session.flush()  # obtain membership.id before seeding requirements

        # Every trip owns exactly one inventory, pre-populated with a leader-owned
        # default requirement set so the gear checklist never starts empty. The trip
        # payload may already carry a nested inventory (TripSchema builds one); reuse
        # it rather than creating a second — Inventory.trip_id is unique.
        inventory = trip.inventory
        if inventory is None:
            inventory = Inventory(trip_id=trip.id)
            db.session.add(inventory)
        db.session.flush()  # obtain inventory.id before seeding requirements
        if membership:
            for spec in DEFAULT_TRIP_REQUIREMENTS:
                db.session.add(TripRequirement(
                    inventory_id=inventory.id,
                    name=spec["name"],
                    category=spec["category"],
                    proposed_by_member_id=membership.id,
                ))
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
            NoResultFound: If trip doesn't exist
        """
        existing_trip = TripService.get_trip_by_id(trip_id)

        logger.info(f"Updating trip {trip_id}")

        for field in _MUTABLE_FIELDS:
            key = camelcase(field)
            if key in trip_data:
                value = trip_data[key]
                if field in ("date_from", "date_to") and isinstance(value, str):
                    value = date.fromisoformat(value)
                setattr(existing_trip, field, value)

        try:
            db.session.commit()
            db.session.refresh(existing_trip)
            logger.info(f"Trip {trip_id} updated successfully")
            return existing_trip
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error updating trip {trip_id}: {e}")
            raise

    @staticmethod
    def delete_trip(trip_id: str, for_everyone: bool) -> None:
        """
        Delete a trip or remove the current user from it.

        If for_everyone is True the whole trip is deleted.
        If False, only the current user's membership is removed; if no
        members remain afterwards the trip is also deleted.

        Raises:
            NoResultFound: If trip doesn't exist or user isn't a member
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
                raise NoResultFound(f"User {user_id} is not associated with trip {trip_id}")

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
    def get_invitations_by_user(user_id: str, include_expired: bool = False) -> List[Trip]:
        """
         Retrieve all invitations to trips received by the user

        Args:
            user_id: The ID of the invited user
            include_expired: If False, only return non-expired invitations (default: False)
            include_expired: Include trip invitations that have expired

        Returns:
            List of Trip objects referenced in the invitation
        Raises:
            NoResultFound: If the user doesn't exist
        """
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User {user_id} not found")

        query = (
            db.session.query(Invitation)
            .options(
                selectinload(Invitation.trip).options(
                    selectinload(Trip.trip_members).selectinload(TripMember.user),
                    selectinload(Trip.invitations).selectinload(Invitation.user),
                    selectinload(Trip.inventory),
                    selectinload(Trip.itinerary),
                )
            )
            .filter(Invitation.user_id == UUID(user_id))
        )
        if not include_expired:
            query = query.filter(Invitation.expires_at >= date.today())

        invitations = query.all()
        logger.info(f"Found {len(invitations)} invitations for user {user_id}")
        return [inv.trip for inv in invitations]

    @staticmethod
    def invite_user(trip_id: str, invitee_id: str) -> Invitation:
        """
        Create an invitation for invitee_id to join trip_id.

        Raises:
            NoResultFound: If the trip or invitee doesn't exist
            ValueError: If invitee is already a member or has a pending invitation
        """
        # Query to check existence, if not found the called method raises an exception that bubbles up to the error handler
        TripService.get_trip_by_id(trip_id, eager=False)

        invitee = db.session.query(User).filter_by(id=UUID(invitee_id)).first()
        if not invitee:
            raise NoResultFound(f"User {invitee_id} not found")

        already_member = db.session.query(TripMember).filter_by(
            user_id=UUID(invitee_id), trip_id=UUID(trip_id)
        ).first()
        if already_member:
            raise ValueError(f"User {invitee_id} is already a member of trip {trip_id}")

        existing = db.session.query(Invitation).filter_by(
            user_id=UUID(invitee_id), trip_id=UUID(trip_id)
        ).first()
        if existing and not existing.is_expired:
            raise ValueError(f"User {invitee_id} already has a pending invitation to trip {trip_id}")
        if existing:
            db.session.delete(existing)

        invitation = Invitation()
        invitation.user_id = UUID(invitee_id)
        invitation.trip_id = UUID(trip_id)
        invitation.expires_at = date.today() + timedelta(days=_INVITATION_TTL_DAYS)
        db.session.add(invitation)
        db.session.commit()

        logger.info("user_invited", extra={"invitee_id": invitee_id, "trip_id": trip_id})
        return invitation

    @staticmethod
    def invite_user_by_email(trip_id: str, email: str) -> Invitation:
        """
        Look up a user by exact email address and invite them to the trip.

        Raises:
            NoResultFound: If no active user has that email, or the trip doesn't exist
            ValueError: If the user is already a member or has a pending invitation
        """
        invitee = db.session.query(User).filter_by(mail=email.strip().lower()).first()
        if not invitee:
            raise NoResultFound("No account found for that email address")
        return TripService.invite_user(trip_id, str(invitee.id))

    @staticmethod
    def handle_invitation(trip_id: str, accepted: bool) -> None:
        """
        Accept or decline a trip invitation for the current user.

        Raises:
            NoResultFound: If invitation doesn't exist or has expired
        """
        user_id = g.current_user_id

        invitation = db.session.query(Invitation).filter_by(
            user_id=UUID(user_id), trip_id=UUID(trip_id)
        ).first()

        if not invitation or invitation.is_expired:
            raise NoResultFound(f"No valid invitation found for user {user_id} to trip {trip_id}")

        if accepted:
            user = db.session.query(User).filter_by(id=UUID(user_id)).first()
            prefill = {}
            if user:
                for field in (
                    "vessel_make", "vessel_model", "vessel_length_cm",
                    "vessel_color_primary", "vessel_color_secondary",
                    "emergency_contact_name", "emergency_contact_phone",
                    "emergency_contact_relationship",
                ):
                    value = getattr(user, field, None)
                    if value is not None:
                        prefill[field] = value

            membership = TripMemberSchema().load({
                'user_id': invitation.user_id,
                'trip_id': invitation.trip_id,
                'role': MemberRoleType.CREW.value,
                **prefill,
            })
            db.session.add(membership)
            logger.info(f"User {user_id} accepted invitation to trip {trip_id}")
        else:
            logger.info(f"User {user_id} declined invitation to trip {trip_id}")

        db.session.delete(invitation)
        db.session.commit()

    @staticmethod
    def cancel_invitation(trip_id: str, invitee_id: str) -> None:
        """
        Cancel a pending invitation (leader action).

        Raises:
            NoResultFound: If no pending invitation exists
        """
        invitation = db.session.query(Invitation).filter_by(
            user_id=UUID(invitee_id), trip_id=UUID(trip_id)
        ).first()

        if not invitation:
            raise NoResultFound(f"No invitation found for user {invitee_id} to trip {trip_id}")

        db.session.delete(invitation)
        db.session.commit()
        logger.info(f"Invitation for user {invitee_id} to trip {trip_id} cancelled")

    @staticmethod
    def remove_member(trip_id: str, user_id: str) -> None:
        """
        Remove a crew member from a trip (leader action).

        Raises:
            NoResultFound: If the user isn't a member of the trip
            ValueError: If attempting to remove the leader
        """
        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=UUID(trip_id)
        ).first()

        if not membership:
            raise NoResultFound(f"User {user_id} is not a member of trip {trip_id}")
        if membership.role == MemberRoleType.LEADER:
            raise ValueError("Cannot remove the trip leader")

        leader = db.session.query(TripMember).filter_by(
            trip_id=UUID(trip_id), role=MemberRoleType.LEADER
        ).first()
        if leader:
            db.session.query(TravelDocument).filter_by(
                trip_id=UUID(trip_id), owner_id=UUID(user_id)
            ).update({"owner_id": leader.user_id})
            # Transfer vehicle arrangement; if they were driver_id, set to null.
            db.session.query(ShuttleVehicle).filter_by(
                trip_id=UUID(trip_id), arranged_by_id=membership.id
            ).update({"arranged_by_id": leader.id})
            db.session.query(ShuttleVehicle).filter_by(
                trip_id=UUID(trip_id), driver_id=membership.id
            ).update({"driver_id": None})

        db.session.delete(membership)
        db.session.commit()
        logger.info("member_removed", extra={"trip_id": trip_id, "user_id": user_id})

    @staticmethod
    def transition_trip_state(trip_id: str, new_state_value: str) -> Trip:
        """
        Advance a trip's state forward along the state machine.

        Args:
            trip_id: The ID of the trip
            new_state_value: The target state string (e.g. "happening")

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
        trip.transition_state(new_state)
        db.session.commit()
        db.session.refresh(trip)
        logger.info(f"Trip {trip_id} transitioned to '{new_state_value}'")
        return trip
