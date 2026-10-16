"""
Mutation Queue Service — applies the changes a phone queued while offline.

The phone sends a batch of envelopes (docs/adr/mobile-offline.md "Sync up"): what kind of
thing changed, how, its id, the new values, and when on the device it happened. Each is
applied through the same service method, and under the same permission rules, as the
online request for that change would be. The queue grants nothing the online app could
not do.

Three properties make a batch safe to send from a phone on a failing connection:

- **Exactly once.** Every envelope's `mutation_id` is recorded in `processed_mutation`
  in the same transaction as the change itself, so a resent batch is answered from the
  record instead of being applied again.
- **In the order it happened.** Envelopes apply in device-timestamp order, not the order
  they arrive in.
- **Each on its own.** One transaction per envelope: a change the server refuses is
  reported and recorded as rejected, and the rest still apply.

The route never comes through here: it has its own channel (Services/
itinerary_route_sync_service.py), since its correctness spans many records.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Optional
from uuid import UUID

from flask import g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound

from Api.database import db
from Models.inventory import Inventory
from Models.processed_mutation import ProcessedMutation
from Models.trip import TripStateType
from Models.trip_member import MemberRoleType, TripMember
from Schemas.trip_member_schema import TripMemberUpdateSchema
from Services.inventory_service import InventoryService
from Services.log_service import LogService
from Services.Middleware.privileges_middleware import check_resource_ownership
from Services.personal_packing_service import PersonalPackingService
from Services.trip_member_service import TripMemberService
from Services.trip_service import TripService

logger = logging.getLogger(__name__)

STATUS_APPLIED = "applied"
STATUS_REJECTED = "rejected"
# Already processed in an earlier batch; the result carries what happened then.
STATUS_DUPLICATE = "duplicate"
# Could not be applied for a reason unrelated to the change itself (the database was
# unreachable, say). Not recorded, so the phone's retry gets a real second attempt.
STATUS_FAILED = "failed"

_OPERATIONS = frozenset({"create", "update", "delete"})

# How long a processed mutation is remembered. A phone resending a batch older than
# this would apply it again; 90 days is the ADR's starting point.
RETENTION = timedelta(days=90)


class MutationRejected(Exception):
    """The server refuses this change. The message is shown to the paddler."""


@dataclass(frozen=True)
class Envelope:
    mutation_id: UUID
    entity_type: str
    operation: str
    entity_id: UUID
    payload: dict
    device_timestamp: datetime


def _parse(raw: object) -> Envelope:
    if not isinstance(raw, dict):
        raise ValueError("A change must be an object")
    operation = raw.get("operation")
    if operation not in _OPERATIONS:
        raise ValueError(f"Unknown operation {operation!r}")
    payload = raw.get("payload") or {}
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    timestamp = datetime.fromisoformat(str(raw.get("deviceTimestamp")))
    if timestamp.tzinfo is None:
        raise ValueError("deviceTimestamp must carry a timezone")
    return Envelope(
        mutation_id=UUID(str(raw.get("mutationId"))),
        entity_type=str(raw.get("entityType")),
        operation=operation,
        entity_id=UUID(str(raw.get("entityId"))),
        payload=payload,
        device_timestamp=timestamp,
    )


# ── permission helpers ────────────────────────────────────────────────────


def _require_access(resource_type: str, resource_id: str, what: str) -> None:
    """The check `@require_owner` makes on the online route."""
    access = check_resource_ownership(resource_type, resource_id)
    if access is None:
        raise MutationRejected(f"That {what} no longer exists.")
    if not access:
        raise MutationRejected(f"You can't change that {what}.")


def _require_leader(trip_id: str) -> None:
    """The check `@require_leader` makes on the online route."""
    membership = (
        db.session.query(TripMember)
        .filter_by(user_id=UUID(g.current_user_id), trip_id=UUID(trip_id))
        .first()
    )
    if membership is None or membership.role != MemberRoleType.LEADER:
        raise MutationRejected("Only the trip leader can do that.")


# ── handlers, one per kind of change ──────────────────────────────────────


def _update_own_float_plan(envelope: Envelope) -> None:
    trip_id = str(envelope.payload.get("tripId"))
    member = db.session.get(TripMember, envelope.entity_id)
    if (
        member is None
        or str(member.trip_id) != trip_id
        or str(member.user_id) != g.current_user_id
    ):
        raise MutationRejected("You can only change your own float plan.")
    fields = {key: value for key, value in envelope.payload.items() if key != "tripId"}
    TripMemberService.update_my_float_plan(trip_id, TripMemberUpdateSchema().load(fields))


def _add_packing_item(envelope: Envelope) -> None:
    PersonalPackingService.add_item(
        str(envelope.payload.get("tripId")),
        str(envelope.payload.get("itemId")),
        entry_id=str(envelope.entity_id),
    )


def _tick_packing_item(envelope: Envelope) -> None:
    PersonalPackingService.set_checked(str(envelope.entity_id), bool(envelope.payload.get("checked")))


def _remove_packing_item(envelope: Envelope) -> None:
    PersonalPackingService.remove(str(envelope.entity_id))


def _trip_inventory_id(envelope: Envelope) -> str:
    """The trip's checklist, named by trip: offline the phone may never have seen the
    inventory's own id, which only arrives with a live trip fetch."""
    trip_id = str(envelope.payload.get("tripId"))
    inventory = db.session.query(Inventory).filter_by(trip_id=UUID(trip_id)).one_or_none()
    if inventory is None:
        raise MutationRejected("That trip has no checklist.")
    inventory_id = str(inventory.id)
    _require_access("inventory", inventory_id, "checklist")
    return inventory_id


def _contribute(envelope: Envelope) -> None:
    """Bring one of your own items for a group checklist slot. `entity_id` is the
    requirement; the service confirms the item is the caller's."""
    InventoryService.contribute_item(
        _trip_inventory_id(envelope), str(envelope.entity_id), str(envelope.payload.get("itemId"))
    )


def _withdraw_contribution(envelope: Envelope) -> None:
    InventoryService.unclaim_requirement(_trip_inventory_id(envelope), str(envelope.entity_id))


def _record_departure(envelope: Envelope) -> None:
    """The leader records that a paddler left the trip. `entity_id` is their crew row;
    the departure time is when it was recorded on the phone."""
    trip_id = str(envelope.payload.get("tripId"))
    _require_access("trip", trip_id, "trip")
    _require_leader(trip_id)
    TripMemberService.record_departure(
        trip_id, str(envelope.entity_id), envelope.device_timestamp, envelope.payload.get("note")
    )


def _clear_departure(envelope: Envelope) -> None:
    trip_id = str(envelope.payload.get("tripId"))
    _require_access("trip", trip_id, "trip")
    _require_leader(trip_id)
    TripMemberService.clear_departure(trip_id, str(envelope.entity_id))


def _create_log(envelope: Envelope) -> None:
    LogService.create_log(envelope.payload, log_id=str(envelope.entity_id))


def _update_log(envelope: Envelope) -> None:
    _require_access("log", str(envelope.entity_id), "log")
    LogService.update_log(str(envelope.entity_id), envelope.payload)


def _delete_log(envelope: Envelope) -> None:
    _require_access("log", str(envelope.entity_id), "log")
    LogService.delete_log(str(envelope.entity_id))


def _update_trip(envelope: Envelope) -> None:
    """Leader-only changes to a trip under way: pause, resume, abort, finish, or a new
    end date. The service's own transition guards decide whether the change is still
    legal when it arrives — a trip finished on the web meanwhile refuses a queued pause.
    """
    trip_id = str(envelope.entity_id)
    _require_access("trip", trip_id, "trip")
    _require_leader(trip_id)

    action = envelope.payload.get("action")
    date_to = envelope.payload.get("dateTo")
    if (action is None) == (date_to is None):
        raise MutationRejected("A trip change carries either an action or a new end date.")

    # The day it happened on the phone, not the day the server hears of it.
    happened_on = envelope.device_timestamp.date()
    if action == "pause":
        TripService.pause_trip(trip_id, paused_on=happened_on)
    elif action == "resume":
        TripService.resume_trip(trip_id, resume_date=happened_on)
    elif action == "abort":
        TripService.abort_trip(trip_id)
    elif action == "finish":
        TripService.transition_trip_state(trip_id, TripStateType.PAST.value)
    elif action is not None:
        raise MutationRejected(f"Unknown trip action {action!r}.")
    else:
        if TripService.get_trip_by_id(trip_id).state != TripStateType.HAPPENING:
            raise MutationRejected("The end date only changes offline while the trip is under way.")
        TripService.update_trip(trip_id, {"dateTo": date.fromisoformat(str(date_to))})


_HANDLERS: dict[tuple[str, str], Callable[[Envelope], None]] = {
    ("trip_member", "update"): _update_own_float_plan,
    ("packing_item", "create"): _add_packing_item,
    ("packing_item", "update"): _tick_packing_item,
    ("packing_item", "delete"): _remove_packing_item,
    ("contribution", "create"): _contribute,
    ("contribution", "delete"): _withdraw_contribution,
    ("crew_departure", "create"): _record_departure,
    ("crew_departure", "delete"): _clear_departure,
    ("log", "create"): _create_log,
    ("log", "update"): _update_log,
    ("log", "delete"): _delete_log,
    ("trip", "update"): _update_trip,
}

# The server refusing the change itself, as opposed to failing to process it.
_REFUSALS = (MutationRejected, PermissionError, NoResultFound, ValueError, ValidationError, IntegrityError)


def _reason(error: Exception) -> str:
    if isinstance(error, ValidationError):
        return f"Invalid values: {error.messages}"
    return str(error) or error.__class__.__name__


def _result(mutation_id: object, status: str, reason: Optional[str] = None, **extra) -> dict:
    result = {"mutationId": str(mutation_id), "status": status, **extra}
    if reason:
        result["reason"] = reason
    return result


class MutationQueueService:
    """Applies a phone's queued offline changes."""

    @staticmethod
    def apply_batch(user_id: str, raw_mutations: list) -> list[dict]:
        results: list[dict] = []
        envelopes: list[Envelope] = []
        for raw in raw_mutations:
            try:
                envelopes.append(_parse(raw))
            except (ValueError, TypeError) as error:
                # Unparseable, so there is no trustworthy id to record it under.
                mutation_id = raw.get("mutationId") if isinstance(raw, dict) else None
                results.append(_result(mutation_id, STATUS_REJECTED, f"Malformed change: {error}"))

        # Stable: two changes made in the same instant keep the order they were queued in.
        for envelope in sorted(envelopes, key=lambda envelope: envelope.device_timestamp):
            results.append(MutationQueueService._apply(UUID(user_id), envelope))
        return results

    @staticmethod
    def _apply(user_id: UUID, envelope: Envelope) -> dict:
        processed = db.session.get(ProcessedMutation, envelope.mutation_id)
        if processed is not None:
            if processed.user_id != user_id:
                return _result(envelope.mutation_id, STATUS_REJECTED, "This change belongs to another account.")
            return _result(envelope.mutation_id, STATUS_DUPLICATE, processed.reason, result=processed.status)

        handler = _HANDLERS.get((envelope.entity_type, envelope.operation))
        if handler is None:
            reason = f"Changes of kind {envelope.entity_type} {envelope.operation} can't be made offline."
            MutationQueueService._record(user_id, envelope, STATUS_REJECTED, reason)
            return _result(envelope.mutation_id, STATUS_REJECTED, reason)

        try:
            # Added before the handler runs, so the service's own commit saves the change
            # and its record together: there is no moment where one exists without the other.
            db.session.add(MutationQueueService._row(user_id, envelope, STATUS_APPLIED))
            handler(envelope)
            db.session.commit()
        except _REFUSALS as error:
            db.session.rollback()
            reason = _reason(error)
            MutationQueueService._record(user_id, envelope, STATUS_REJECTED, reason)
            logger.info(
                "mutation_rejected",
                extra={"mutation_id": str(envelope.mutation_id), "entity_type": envelope.entity_type},
            )
            return _result(envelope.mutation_id, STATUS_REJECTED, reason)
        except Exception:
            db.session.rollback()
            logger.exception("mutation_failed", extra={"mutation_id": str(envelope.mutation_id)})
            return _result(envelope.mutation_id, STATUS_FAILED, "Couldn't be applied now; it will be retried.")

        logger.info(
            "mutation_applied",
            extra={"mutation_id": str(envelope.mutation_id), "entity_type": envelope.entity_type},
        )
        return _result(envelope.mutation_id, STATUS_APPLIED)

    @staticmethod
    def _row(user_id: UUID, envelope: Envelope, status: str, reason: Optional[str] = None) -> ProcessedMutation:
        return ProcessedMutation(
            id=envelope.mutation_id,
            user_id=user_id,
            entity_type=envelope.entity_type[:50],
            operation=envelope.operation,
            status=status,
            reason=reason[:500] if reason else None,
        )

    @staticmethod
    def _record(user_id: UUID, envelope: Envelope, status: str, reason: str) -> None:
        db.session.add(MutationQueueService._row(user_id, envelope, status, reason))
        db.session.commit()

    @staticmethod
    def prune(now: Optional[datetime] = None) -> int:
        """Forget processed mutations older than the retention window."""
        cutoff = (now or datetime.now(timezone.utc)) - RETENTION
        deleted = db.session.query(ProcessedMutation).filter(ProcessedMutation.created < cutoff).delete()
        db.session.commit()
        logger.info("processed_mutations_pruned", extra={"deleted": deleted})
        return deleted
