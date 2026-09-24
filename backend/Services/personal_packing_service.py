"""
Personal Packing Service — a member's private per-trip packing list.

Each entry is one of the caller's own gear-closet items they are carrying for
themselves on a given trip — distinct from a RequirementContribution, which covers a
shared group slot. The list is private: only the owning member can read or mutate it
(the leader has no special access). All lookups are scoped through the caller's
TripMember, so a non-owner can never see or touch another member's list.
"""

import logging
from typing import List, Optional
from uuid import UUID

from flask import g
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.personal_packing_item import PersonalPackingItem
from Models.trip_member import TripMember
from Models.item import Item, ItemStatusType

logger = logging.getLogger(__name__)


class PersonalPackingService:
    """Service class for a member's private per-trip packing list."""

    @staticmethod
    def _get_member(trip_id: str) -> TripMember:
        member = db.session.query(TripMember).filter_by(
            user_id=UUID(g.current_user_id), trip_id=UUID(trip_id)
        ).first()
        if not member:
            raise NoResultFound("Current user is not a member of this trip")
        return member

    @staticmethod
    def _get_own_entry(entry_id: str) -> PersonalPackingItem:
        """Fetch a packing entry only if it belongs to the caller. Returns 404 for
        both missing and not-owned entries — never leaks another member's list."""
        entry = (
            db.session.query(PersonalPackingItem)
            .join(TripMember, TripMember.id == PersonalPackingItem.trip_member_id)
            .filter(
                PersonalPackingItem.id == UUID(entry_id),
                TripMember.user_id == UUID(g.current_user_id),
            )
            .first()
        )
        if entry is None:
            raise NoResultFound(f"Packing item {entry_id} not found")
        return entry

    @staticmethod
    def list_for_trip(trip_id: str) -> List[PersonalPackingItem]:
        member = PersonalPackingService._get_member(trip_id)
        items = db.session.query(PersonalPackingItem).filter_by(
            trip_member_id=member.id
        ).all()
        logger.info(
            f"Listed {len(items)} packing items for member {member.id} on trip {trip_id}"
        )
        return items

    @staticmethod
    def add_item(trip_id: str, item_id: str, entry_id: Optional[str] = None) -> PersonalPackingItem:
        """`entry_id` is the id a phone gave the entry while offline (M9d), so later
        queued changes can refer to it; omitted, the server generates one."""
        member = PersonalPackingService._get_member(trip_id)

        item = db.session.get(Item, UUID(item_id))
        if item is None:
            raise NoResultFound(f"Item {item_id} not found in database")
        if item.user_id != UUID(g.current_user_id):
            raise PermissionError("You can only pack your own gear")
        if item.status != ItemStatusType.OWNED:
            raise ValueError(
                "Only owned items can be added to your packing list; "
                "confirm you possess this item first"
            )

        existing = db.session.query(PersonalPackingItem).filter_by(
            trip_member_id=member.id, item_id=UUID(item_id)
        ).first()
        if existing is not None:
            raise ValueError("This item is already on your packing list")

        entry = PersonalPackingItem(trip_member_id=member.id, item_id=UUID(item_id))
        if entry_id is not None:
            entry.id = UUID(entry_id)
        db.session.add(entry)
        db.session.commit()
        db.session.refresh(entry)
        logger.info(
            f"Member {member.id} added item {item_id} to their packing list on trip {trip_id}"
        )
        return entry

    @staticmethod
    def set_checked(entry_id: str, checked: bool) -> PersonalPackingItem:
        entry = PersonalPackingService._get_own_entry(entry_id)
        entry.checked = bool(checked)
        db.session.commit()
        db.session.refresh(entry)
        logger.info(f"Packing item {entry_id} checked set to {entry.checked}")
        return entry

    @staticmethod
    def remove(entry_id: str) -> None:
        entry = PersonalPackingService._get_own_entry(entry_id)
        db.session.delete(entry)
        db.session.commit()
        logger.info(f"Packing item {entry_id} removed")
