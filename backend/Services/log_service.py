"""
Log Service - Business logic for log operations.
"""
import logging
import math
from datetime import datetime, timezone
from typing import Any, List, Optional, cast
from uuid import UUID
from sqlalchemy.exc import NoResultFound, IntegrityError
from sqlalchemy.orm import selectinload

from Schemas.base_schema import camelcase

from Models.log import Log
from Models.user import User
from Models.trip_member import TripMember
from Models.endorsement_request import (
    EndorsementRequest,
    EndorsementRequestStatusType,
)
from Schemas.log_schema import LogSchema
from Api.database import db
from Services.block_service import BlockService

logger = logging.getLogger(__name__)


def _as_float(value: Optional[Any]) -> float:
    """Coerce a nullable Numeric column value to a float (None contributes 0.0).

    The Log money/measurement columns are mapped as Numeric (Decimal at runtime); this
    keeps the aggregation total-friendly and type-checkable in one place.
    """
    return float(value) if value is not None else 0.0


class LogNotEndorsableError(Exception):
    """A log that is structurally ineligible for endorsement (no trip link).

    Distinct from PermissionError (403, the caller is not allowed): this is a 422 —
    the log is the wrong shape to endorse, regardless of who is asking.
    """


class LogService:
    """Service class for Log-related business logic."""

    @staticmethod
    def get_log_by_id(id: str) -> Log:
        """
        Retrieve a log by its ID.

        Args:
            log_id: The ID of the log to retrieve

        Returns:
            Log object if found

        Raises:
            NoResultFound: If log doesn't exist
        """
        log = db.session.query(Log).filter_by(id=UUID(id)).first()
        if not log:
            logger.warning(f"Log with id {id} not found")
            raise NoResultFound(f"Log {id} not found in database")
        return log

    @staticmethod
    def get_logs_by_user(user_id: str, page: int = 1, per_page: int = 20) -> dict:
        """
        Retrieve a paginated page of logs created by a user.

        Returns:
            {"items": [...], "total": N, "page": P, "pages": P}
        """
        query = db.session.query(Log).filter_by(user_id=UUID(user_id))
        total = query.count()
        items = query.offset((page - 1) * per_page).limit(per_page).all()
        pages = math.ceil(total / per_page) if total > 0 else 1
        logger.info(f"Returning {len(items)} of {total} logs for user {user_id} (page {page})")
        return {"items": items, "total": total, "page": page, "pages": pages}

    @staticmethod
    def create_log(log_data: dict) -> Log:
        """
        Create a new log.

        Args:
            log_data: Dictionary containing log information

        Returns:
            Created Log object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new log")
        log = cast(Log, LogSchema().load(log_data))
        db.session.add(log)
        db.session.commit()

        db.session.refresh(log)
        logger.info(f"Log {log.id} created successfully")
        return log

    @staticmethod
    def update_log(id: str, log_data: dict) -> Log:
        """
        Update an existing log.

        Args:
            log_id: The ID of the log to update
            log_data: Dictionary containing log information

        Returns:
            Updated Log object

        Raises:
            ValidationError: If data is invalid
            NoResultFound: If log doesn't exist
            IntegrityError: If database constraints are violated
        """
        log = LogService.get_log_by_id(id)
        logger.info(f"Updating log {id}")

        _MUTABLE_FIELDS = {"hours", "avg_sea", "distance", "date", "notes", "trip_id"}
        for field in _MUTABLE_FIELDS:
            key = camelcase(field)
            if key in log_data:
                setattr(log, field, log_data[key])

        try:
            db.session.commit()
            db.session.refresh(log)
            logger.info(f"Log {id} updated successfully")
            return log

        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error updating log {id}: {e}")
            raise

    @staticmethod
    def delete_log(id: str) -> None:
        """
        Delete a log by its ID.

        Args:
            log_id: The ID of the log to delete

        Raises:
            NoResultFound: If log doesn't exist
            IntegrityError: If log has references that prevent deletion
        """
        log = LogService.get_log_by_id(id)

        try:
            logger.info(f"Deleting log {id}")
            db.session.delete(log)
            db.session.commit()
            logger.info(f"Log {id} deleted successfully")

        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting log {id}: {e}")
            raise IntegrityError(
                f"Cannot delete log {id} due to existing references",
                params=None,
                orig=e
            )

    @staticmethod
    def endorse_log(id: str, user_id: str) -> None:
        """
        Endorse a log entry under the same-trip mutual-attestation rule.

        A user `E` may endorse log `L` (author `A`) iff `L.trip_id` is set AND both `A`
        and `E` have held a TripMember row for that trip AND `E != A`. Endorsement is flat
        factual attestation ("I shared this trip and corroborate it happened") — equal
        regardless of the endorser's certifications or role.

        Args:
            id: The ID of the log to endorse
            user_id: The ID of the user endorsing the log

        Raises:
            NoResultFound: If the log or endorsing user doesn't exist
            LogNotEndorsableError: If the log has no trip link (422 — wrong shape)
            PermissionError: If the caller is the author or did not share the trip (403)
        """
        log = LogService.get_log_by_id(id)

        if log.trip_id is None:
            raise LogNotEndorsableError(
                "This log is not linked to a trip and cannot be endorsed"
            )

        endorser_id = UUID(user_id)
        if log.user_id == endorser_id:
            raise PermissionError("You cannot endorse your own log")

        # Block beats the shared-trip rule: a block in either direction between the
        # endorser and the author forbids endorsement, even of a trip they shared.
        if BlockService.block_exists_between(endorser_id, cast(UUID, log.user_id)):
            raise PermissionError(
                "You can only endorse a log from a trip you shared with its author"
            )

        # Both author and endorser must have held a TripMember row for the log's trip.
        # Two distinct member rows for {author, endorser} on that trip proves the shared trip.
        shared_members = (
            db.session.query(TripMember.user_id)
            .filter(
                TripMember.trip_id == log.trip_id,
                TripMember.user_id.in_([log.user_id, endorser_id]),
            )
            .distinct()
            .count()
        )
        if shared_members < 2:
            raise PermissionError(
                "You can only endorse a log from a trip you shared with its author"
            )

        user = db.session.query(User).filter_by(id=endorser_id).first()
        if not user:
            raise NoResultFound(f"User {user_id} not found")

        # Resolve any pending endorsement request the author sent this endorser (M7b §2b).
        pending_request = (
            db.session.query(EndorsementRequest)
            .filter_by(
                log_id=log.id,
                addressee_id=endorser_id,
                status=EndorsementRequestStatusType.PENDING,
            )
            .first()
        )
        if pending_request is not None:
            pending_request.status = EndorsementRequestStatusType.ACTIONED
            pending_request.responded_at = datetime.now(timezone.utc)

        if user not in log.user_endorsed_logs:
            log.user_endorsed_logs.append(user)
            db.session.commit()
            logger.info("log_endorsed", extra={"log_id": id, "endorser_id": user_id})
        elif pending_request is not None:
            db.session.commit()
            logger.info("log_endorse_request_resolved", extra={"log_id": id, "endorser_id": user_id})
        else:
            logger.info("log_endorse_noop", extra={"log_id": id, "endorser_id": user_id})

    @staticmethod
    def unendorse_log(id: str, user_id: str) -> None:
        """
        Remove endorsement from a log entry.

        Args:
            log_id: The ID of the log to unendorse
            user_id: The ID of the user removing endorsement

        Raises:
            NoResultFound: If log doesn't exist
        """

        log = LogService.get_log_by_id(id)
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        
        if not user:
            raise NoResultFound(f"User {user_id} not found")

        if user in log.user_endorsed_logs:
            log.user_endorsed_logs.remove(user)
            db.session.commit()
            logger.info(f"User {user_id} removed endorsement from log {id}")
        else:
            logger.info(f"User {user_id} hasn't endorsed log {id}")
    
    @staticmethod
    def get_endorsed_logs(user_id: str) -> List[Log]:
        """
        Retrieve all logs created by a user.

        Args:
            user_id: The ID of the user

        Returns:
            List of Log objects
        """
        user = db.session.query(User).options(selectinload(User.endorsed_logs)).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User with id {user_id} not found in db")
        logger.info(f"Found {len(user.endorsed_logs)} logs for user {user_id}")
        return user.endorsed_logs

    @staticmethod
    def stats_for_user(user_id: str) -> dict:
        """
        Aggregate a paddler's logbook into summary stats. Pure read aggregation over the
        user's Log rows — no new storage. Reused by both the private /stats endpoint and
        the public profile projection.

        Returns a camelCase dict ready to jsonify.
        """
        logs = (
            db.session.query(Log)
            .options(selectinload(Log.user_endorsed_logs))
            .filter_by(user_id=UUID(user_id))
            .all()
        )

        total_distance = sum(_as_float(log.distance) for log in logs)
        total_hours = sum(_as_float(log.hours) for log in logs)
        trip_ids = {log.trip_id for log in logs if log.trip_id is not None}
        endorsements_received = sum(len(log.user_endorsed_logs) for log in logs)

        conditions_distribution: dict = {}
        activity_by_month: dict = {}
        for log in logs:
            if log.avg_sea is not None:
                conditions_distribution[log.avg_sea] = conditions_distribution.get(log.avg_sea, 0) + 1
            if log.date is not None:
                month_key = log.date.strftime("%Y-%m")
                bucket = activity_by_month.setdefault(
                    month_key, {"month": month_key, "distance": 0.0, "hours": 0.0, "count": 0}
                )
                bucket["distance"] += _as_float(log.distance)
                bucket["hours"] += _as_float(log.hours)
                bucket["count"] += 1

        return {
            "totalDistance": total_distance,
            "totalHours": total_hours,
            "logCount": len(logs),
            "tripCount": len(trip_ids),
            "endorsementsReceived": endorsements_received,
            "conditionsDistribution": conditions_distribution,
            "activityByMonth": [activity_by_month[key] for key in sorted(activity_by_month)],
        }
