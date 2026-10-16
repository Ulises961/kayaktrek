"""
Trip Service - Business logic for trip operations.
"""

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, List, Optional
from flask import g
from sqlalchemy.exc import NoResultFound, IntegrityError
from uuid import UUID

from Models.difficulty import DifficultyType
from Models.trip import Trip, TripStateType, TripOutcomeType
from Models.trip_member import TripMember, MemberRoleType
from Models.invitation import Invitation
from Models.inventory import Inventory
from Models.itinerary import Itinerary
from Models.day import Day
from Models.trip_requirement import TripRequirement
from Services.Utils.route_distance import compute_total_miles
from Services.Utils.point_ordering import chain_in_order, walk_linked_list
from Services.Utils.timezone_utils import resolve_timezone
from Api.seed import DEFAULT_TRIP_REQUIREMENTS, seed_member_packing
from Services.catalog_item_service import CatalogItemService
from Services.itinerary_service import ItineraryService
from Models.user import User
from Models.travel_document import TravelDocument
from Models.shuttle_vehicle import ShuttleVehicle
from Schemas.trip_member_schema import TripMemberSchema
from Schemas.trip_schema import TripSchema
from Api.database import db
from sqlalchemy.orm import selectinload
from Services.user_service import UserService
from Services.block_service import BlockService
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
    def find_happening_trip(trip_id: str) -> Optional[Trip]:
        """The trip with this id if it is happening, otherwise None.

        Missing, not yet started, finished, and an id that is not a UUID are all the same
        answer, so a caller cannot tell them apart — the live endpoints rely on that.
        """
        try:
            trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        except ValueError:
            return None
        if trip is None or trip.state != TripStateType.HAPPENING:
            return None
        return trip

    @staticmethod
    def touch_last_accessed(trip: Trip) -> None:
        """Bump Trip.last_accessed_at — drives the weather-fetch beat tasks'
        attention gate (docs/adr/features.md §1a). Called only from an
        actual view (the GET /trip/<id> resource, mobile pullChanges) — never
        from get_trip_by_id itself, which privileges_middleware also calls on
        every authorization check for an unrelated mutation.
        """
        trip.last_accessed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()

    @staticmethod
    def get_trips_by_user(
        user_id: str,
        page: int = 1,
        per_page: int = 20,
        state: Optional[str] = None,
        difficulty: Optional[str] = None,
        sort: Optional[str] = None,
        min_miles: Optional[float] = None,
        max_miles: Optional[float] = None,
    ) -> dict:
        """
        Retrieve a paginated, filterable page of trips for a user.

        `state`/`difficulty` filter on the trip's own enum fields. `sort` selects
        the ordering: "soonest"/"latest" order by date_from, "latest_end" orders
        by date_to descending (most recently finished first — the Past listing's
        fixed order); anything else falls back to newest-created first.

        `min_miles`/`max_miles` filter on the itinerary's route distance. This is
        never a stored, SQL-filterable column (`Itinerary.total_miles` is written
        at creation and never kept in sync — see `compute_total_miles`'s
        docstring), so a distance filter falls back to fetching every trip
        matching the other filters, scoring each in Python, and paginating the
        filtered/sorted list in memory. A user's own trip count is small enough
        (tens, not thousands) for this to be cheap — the same constraint that
        makes `ItineraryService.search_public_itineraries` do the same thing.

        Raises:
            NoResultFound: If the user does not exist
            ValueError: If `state` or `difficulty` is not a recognised enum value
        Returns:
            {"items": [...], "total": N, "page": P, "pages": P}
        """
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User with id {user_id} not found")

        wants_distance_filter = min_miles is not None or max_miles is not None

        query = (
            db.session.query(Trip)
            .join(TripMember, TripMember.trip_id == Trip.id)
            .filter(TripMember.user_id == UUID(user_id))
            .options(
                selectinload(Trip.trip_members).selectinload(TripMember.user),
                selectinload(Trip.invitations).selectinload(Invitation.user),
                selectinload(Trip.inventory),
                selectinload(Trip.itinerary).selectinload(Itinerary.days).selectinload(Day.points)
                if wants_distance_filter
                else selectinload(Trip.itinerary),
            )
        )
        if state:
            query = query.filter(Trip.state == TripStateType(state))
        if difficulty:
            query = query.filter(Trip.difficulty == DifficultyType(difficulty))

        order: Any
        if sort == "soonest":
            order = Trip.date_from.asc().nullslast()
        elif sort == "latest":
            order = Trip.date_from.desc().nullslast()
        elif sort == "latest_end":
            order = Trip.date_to.desc().nullslast()
        else:
            order = Trip.created.desc()

        if not wants_distance_filter:
            total = query.count()
            items = query.order_by(order, Trip.id).offset((page - 1) * per_page).limit(per_page).all()
            pages = math.ceil(total / per_page) if total > 0 else 1
            logger.info(f"Returning {len(items)} of {total} trips for user {user_id} (page {page})")
            return {"items": items, "total": total, "page": page, "pages": pages}

        candidates = query.order_by(order, Trip.id).all()
        matched = []
        for trip in candidates:
            miles = compute_total_miles(trip.itinerary.days) if trip.itinerary else 0.0
            if min_miles is not None and miles < min_miles:
                continue
            if max_miles is not None and miles > max_miles:
                continue
            matched.append(trip)

        total = len(matched)
        start = (page - 1) * per_page
        items = matched[start:start + per_page]
        pages = math.ceil(total / per_page) if total > 0 else 1
        logger.info(f"Returning {len(items)} of {total} trips for user {user_id} (page {page}, distance-filtered)")
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

        # A nested itinerary is built by TripSchema's own load, which bypasses
        # ItineraryService and so never creates the Day 0 every dropped point
        # stages into. Give it one here, the same way the nested inventory below
        # is reconciled.
        if trip.itinerary is not None:
            ItineraryService.ensure_staging_day(trip.itinerary)
            # That same bypass means nothing writes the payload's point order into
            # the next_id chain either. The array a client posts *is* the route's
            # order, but without a chain every point is a disconnected head and
            # readers fall back to sorting by UUID — creation order only until two
            # points share a millisecond, after which their random bits decide, which
            # leaves the route's distance and drawn line undefined.
            #
            # Unconditional: PointSchema makes next_id dump_only, so the array
            # order is the only order a nested payload can express.
            db.session.flush()
            for day in trip.itinerary.days:
                chain_in_order(list(day.points or []))

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
            # Seed shared requirements from the leader's curated CatalogItem
            # template when they have one; first-timers (empty template) fall
            # back to the hardcoded default list.
            catalog_items = CatalogItemService.get_items_by_owner(str(current_user.id))
            if catalog_items:
                for catalog_item in catalog_items:
                    db.session.add(TripRequirement(
                        inventory_id=inventory.id,
                        name=catalog_item.name,
                        category=catalog_item.category.slug if catalog_item.category else None,
                        proposed_by_member_id=membership.id,
                        catalog_item_id=catalog_item.id,
                    ))
            else:
                for spec in DEFAULT_TRIP_REQUIREMENTS:
                    db.session.add(TripRequirement(
                        inventory_id=inventory.id,
                        name=spec["name"],
                        category=spec["category"],
                        proposed_by_member_id=membership.id,
                    ))
            # Seed the leader's private packing list from their default kit.
            seed_member_packing(membership)
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
    def delete_trip_for_everyone(trip_id: str) -> None:
        """
        Delete the entire trip and all its associations for every member.

        Raises:
            NoResultFound: If trip doesn't exist
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip with id {trip_id} not found")

        logger.info("trip_deleted_for_everyone", extra={"trip_id": trip_id})
        db.session.delete(trip)
        db.session.commit()

    @staticmethod
    def leave_trip(trip_id: str) -> None:
        """
        Remove the current user's own membership from a trip.

        If the caller was the trip's leader and crew remain, the trip survives
        with no leader — see TripLeadershipService.claim_leadership. If no
        members remain afterwards, the trip itself is deleted.

        Raises:
            NoResultFound: If trip doesn't exist or user isn't a member
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip with id {trip_id} not found")

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
        logger.info("trip_member_left", extra={"trip_id": trip_id, "user_id": user_id})

        # Delete the trip if no users remain (business logic decision)
        db.session.refresh(trip)
        if not trip.travellers:
            db.session.delete(trip)
            db.session.commit()
            logger.info("trip_deleted_no_members_remaining", extra={"trip_id": trip_id})

    @staticmethod
    def pause_trip(trip_id: str, paused_on: Optional[date] = None) -> Trip:
        """
        Pause a happening trip (storm delay, injury wait, etc).

        Args:
            paused_on: The day the pause happened (defaults to today). A pause queued
                offline arrives days later and carries the day it was made.

        Raises:
            NoResultFound: If trip doesn't exist
            ValueError: If the trip isn't happening or is already paused
        """
        trip = TripService.get_trip_by_id(trip_id)
        if trip.state != TripStateType.HAPPENING:
            raise ValueError(f"Cannot pause a trip in state '{trip.state.value}'")
        if trip.is_paused:
            raise ValueError(f"Trip {trip_id} is already paused")

        trip.is_paused = True
        trip.paused_at = paused_on or date.today()
        db.session.commit()
        db.session.refresh(trip)
        logger.info("trip_paused", extra={"trip_id": trip_id})
        return trip

    @staticmethod
    def resume_trip(trip_id: str, resume_date: Optional[date] = None) -> Trip:
        """
        Resume a paused trip, shifting every Day after the pause date forward by
        the resulting gap and extending date_to to match. day_number — the
        immutable logical sequence position — is never touched.

        Args:
            trip_id: The ID of the trip
            resume_date: Calendar date the expedition resumes (defaults to today).
                Must be on or after paused_at.

        Raises:
            NoResultFound: If trip doesn't exist
            ValueError: If the trip isn't paused, or resume_date precedes paused_at
        """
        trip = TripService.get_trip_by_id(trip_id)
        if trip.state != TripStateType.HAPPENING or not trip.is_paused or trip.paused_at is None:
            raise ValueError(f"Trip {trip_id} is not paused")

        resume = resume_date or date.today()
        if resume < trip.paused_at:
            raise ValueError("resume_date cannot precede the pause date")

        gap_days = (resume - trip.paused_at).days
        if gap_days > 0 and trip.itinerary:
            gap = timedelta(days=gap_days)
            for day in trip.itinerary.days:
                if day.date is not None and day.date > trip.paused_at:
                    day.date = day.date + gap
            if trip.date_to is not None:
                trip.date_to = trip.date_to + gap

        trip.is_paused = False
        trip.paused_at = None
        db.session.commit()
        db.session.refresh(trip)
        logger.info("trip_resumed", extra={"trip_id": trip_id, "gap_days": gap_days})
        return trip

    @staticmethod
    def abort_trip(trip_id: str) -> Trip:
        """
        End a paused expedition early — the only way to reach `past` without
        resuming. Deliberately bypasses Trip.transition_state: that method's
        happening→past branch infers outcome=COMPLETED when unset and only
        enforces the generic forward-only state machine, whereas abort needs
        the stricter "happening + paused" precondition and an unconditional
        INTERRUPTED outcome.

        Raises:
            NoResultFound: If trip doesn't exist
            ValueError: If the trip isn't happening and paused
        """
        trip = TripService.get_trip_by_id(trip_id)
        if trip.state != TripStateType.HAPPENING or not trip.is_paused:
            raise ValueError(f"Trip {trip_id} can only be aborted while happening and paused")

        trip.state = TripStateType.PAST
        trip.outcome = TripOutcomeType.INTERRUPTED
        db.session.commit()
        db.session.refresh(trip)
        logger.info("trip_aborted", extra={"trip_id": trip_id})
        return trip

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
    def invite_user(trip_id: str, invitee_id: str, inviter_id: str | None = None) -> Invitation:
        """
        Create an invitation for invitee_id to join trip_id.

        When `inviter_id` is provided (the authenticated leader), a block in either
        direction between inviter and invitee forbids the invitation.

        Raises:
            NoResultFound: If the trip or invitee doesn't exist
            PermissionError: If inviter and invitee have blocked each other
            ValueError: If invitee is already a member or has a pending invitation
        """
        # Query to check existence, if not found the called method raises an exception that bubbles up to the error handler
        TripService.get_trip_by_id(trip_id, eager=False)

        invitee = db.session.query(User).filter_by(id=UUID(invitee_id)).first()
        if not invitee:
            raise NoResultFound(f"User {invitee_id} not found")

        if inviter_id is not None and BlockService.block_exists_between(inviter_id, invitee_id):
            raise PermissionError("You cannot invite this paddler")

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
            db.session.flush()  # obtain membership.id before seeding packing
            # Seed the new crew member's private packing list from their default kit.
            seed_member_packing(membership)
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
    def _resolve_start_timezone(trip: Trip) -> Optional[str]:
        """Resolve the IANA timezone of the itinerary's first located point (earliest
        Day, linked-list order). Returns None if the itinerary has no located points —
        trip_today() falls back to UTC in that case."""
        if trip.itinerary is None:
            return None
        days = (
            db.session.query(Day)
            .filter(Day.itinerary_id == trip.itinerary.id)
            .options(selectinload(Day.points))
            .order_by(Day.day_number)
            .all()
        )
        for day in days:
            points = day.points or []
            point_map = {str(point.id): point for point in points}
            for point_id in walk_linked_list(points):
                point = point_map[point_id]
                if point.latitude is not None and point.longitude is not None:
                    return resolve_timezone(float(point.latitude), float(point.longitude))
        return None

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
        if trip.state == TripStateType.BUILDING and new_state == TripStateType.HAPPENING and trip.timezone_name is None:
            trip.timezone_name = TripService._resolve_start_timezone(trip)
        trip.transition_state(new_state)
        db.session.commit()
        db.session.refresh(trip)
        logger.info(f"Trip {trip_id} transitioned to '{new_state_value}'")
        return trip
