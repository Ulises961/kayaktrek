from datetime import date
from typing import Any, List, Optional
from uuid import UUID
import logging

from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
from werkzeug.utils import secure_filename

from Api.database import db
from Models.travel_document import TravelDocument, TravelDocumentType
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase
from Schemas.travel_document_schema import TravelDocumentSchema
from Services.storage_service import StorageService

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = ("type", "name", "date", "expiry_date", "confirmation_number", "url", "notes")


def _governing_date(doc: TravelDocument) -> Optional[date]:
    """The date the document stops being current.

    For anything carrying both an issue and an expiry date — a passport, an
    insurance policy — that is the expiry: an issue date in the past says
    nothing about whether the document is still good.
    """
    dates = [d for d in (doc.date, doc.expiry_date) if d is not None]
    return max(dates) if dates else None


def _require_trip_open(trip: Trip) -> None:
    """Once a trip is over, its paperwork is the record of what happened."""
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("This document cannot be changed on a completed trip")


def _require_editable(doc: TravelDocument, trip: Trip) -> None:
    """Guard for edits only.

    Deletion deliberately does not go through here: an out-of-date document is
    the one most worth removing, and freezing it leaves a mistyped year or a
    booking that fell through attached to the trip permanently.
    """
    _require_trip_open(trip)
    gov = _governing_date(doc)
    if gov is not None and gov < date.today():
        raise ValueError("This document's date has passed and can no longer be edited")


def _require_owner_or_leader(doc: TravelDocument, user_id: str) -> None:
    membership = db.session.query(TripMember).filter_by(
        user_id=UUID(user_id), trip_id=doc.trip_id
    ).first()
    if membership is None or (membership.role != MemberRoleType.LEADER and doc.owner_id != UUID(user_id)):
        raise PermissionError("Only the document owner or trip leader can modify this")


class TravelDocumentService:

    @staticmethod
    def list_for_trip(trip_id: str) -> List[TravelDocument]:
        return (
            db.session.query(TravelDocument)
            .filter_by(trip_id=UUID(trip_id))
            .order_by(TravelDocument.date.asc().nullslast(), TravelDocument.expiry_date.asc().nullslast())
            .all()
        )

    @staticmethod
    def create(trip_id: str, data: dict, user_id: str) -> TravelDocument:
        """
        Create a travel document. Any trip member can create; the creator becomes owner.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Trip not found
        """
        if not db.session.query(Trip).filter_by(id=UUID(trip_id)).first():
            raise NoResultFound(f"Trip {trip_id} not found")

        doc: TravelDocument = TravelDocumentSchema().load(data)
        doc.trip_id = UUID(trip_id)
        doc.owner_id = UUID(user_id)

        db.session.add(doc)
        db.session.commit()
        db.session.refresh(doc)
        logger.info("travel_document_created", extra={
            "trip_id": trip_id, "document_id": str(doc.id), "user_id": user_id,
        })
        return doc

    @staticmethod
    def update(document_id: str, data: dict, user_id: str) -> TravelDocument:
        """
        Partially update a travel document. Membership is pre-validated by the resource layer.
        Only the owner or trip leader may update; record must still be within its editable window.

        Raises:
            NoResultFound: Document not found
            PermissionError: User is neither owner nor leader
            ValueError: Document's governing date has passed or trip is complete
        """
        doc = db.session.query(TravelDocument).filter_by(id=UUID(document_id)).first()
        if not doc:
            raise NoResultFound(f"TravelDocument {document_id} not found")

        _require_editable(doc, doc.trip)
        _require_owner_or_leader(doc, user_id)

        for field in _UPDATABLE_FIELDS:
            key = camelcase(field)
            if key in data:
                value = data[key]
                if field == "type" and value is not None:
                    value = TravelDocumentType(value)
                setattr(doc, field, value)

        def _as_date(v: Any) -> Optional[date]:
            if v is None:
                return None
            if isinstance(v, date):
                return v
            try:
                return date.fromisoformat(str(v))
            except ValueError:
                return None

        d = _as_date(doc.date)
        exp = _as_date(doc.expiry_date)
        if d and exp and exp < d:
            raise ValidationError(
                {"expiry_date": ["Expiry date must be on or after the document date."]}
            )

        db.session.commit()
        db.session.refresh(doc)
        logger.info("travel_document_updated", extra={"document_id": document_id, "user_id": user_id})
        return doc

    @staticmethod
    def delete(document_id: str, user_id: str) -> None:
        """
        Delete a travel document. Removes the MinIO attachment first if one exists.
        Membership is pre-validated by the resource layer.

        Unlike an edit, this is allowed on a document whose own date has passed —
        only a completed trip freezes it.

        Raises:
            NoResultFound: Document not found
            PermissionError: User is neither owner nor leader
            ValueError: Trip is complete
        """
        doc = db.session.query(TravelDocument).filter_by(id=UUID(document_id)).first()
        if not doc:
            raise NoResultFound(f"TravelDocument {document_id} not found")

        _require_trip_open(doc.trip)
        _require_owner_or_leader(doc, user_id)

        if doc.attachment_path:
            StorageService.delete(doc.attachment_path, "document")

        db.session.delete(doc)
        db.session.commit()
        logger.info("travel_document_deleted", extra={"document_id": document_id, "user_id": user_id})

    @staticmethod
    def upload_attachment(document_id: str, file_bytes: bytes, filename: str, user_id: str) -> TravelDocument:
        """
        Upload or replace the file attachment for a travel document.
        If a previous attachment exists it is deleted from MinIO first.

        Raises:
            NoResultFound: Document not found
            PermissionError: User is neither owner nor leader
            ValueError: Document's governing date has passed or trip is complete
            StorageValidationError: File fails MIME or size validation
        """
        doc = db.session.query(TravelDocument).filter_by(id=UUID(document_id)).first()
        if not doc:
            raise NoResultFound(f"TravelDocument {document_id} not found")

        _require_editable(doc, doc.trip)
        _require_owner_or_leader(doc, user_id)

        if doc.attachment_path:
            StorageService.delete(doc.attachment_path, "document")

        safe_name = secure_filename(filename) or "attachment"
        object_key = f"{doc.trip_id}/{document_id}/{safe_name}"
        StorageService.upload(file_bytes, object_key, "document")
        doc.attachment_path = object_key

        db.session.commit()
        db.session.refresh(doc)
        logger.info("travel_document_attachment_uploaded", extra={
            "document_id": document_id, "user_id": user_id, "key": object_key,
        })
        return doc

    @staticmethod
    def delete_attachment(document_id: str, user_id: str) -> TravelDocument:
        """
        Remove the file attachment from a travel document.

        Like deleting the document itself, this is allowed once the document's own
        date has passed — the attachment is a stored copy of someone's permit or
        policy, and withdrawing it must not depend on the date on its face.

        Raises:
            NoResultFound: Document not found or has no attachment
            PermissionError: User is neither owner nor leader
            ValueError: Trip is complete
        """
        doc = db.session.query(TravelDocument).filter_by(id=UUID(document_id)).first()
        if not doc:
            raise NoResultFound(f"TravelDocument {document_id} not found")
        if not doc.attachment_path:
            raise NoResultFound("This document has no attachment")

        _require_trip_open(doc.trip)
        _require_owner_or_leader(doc, user_id)

        StorageService.delete(doc.attachment_path, "document")
        doc.attachment_path = None

        db.session.commit()
        db.session.refresh(doc)
        logger.info("travel_document_attachment_deleted", extra={
            "document_id": document_id, "user_id": user_id,
        })
        return doc

    @staticmethod
    def get_attachment_url(document_id: str, user_id: str) -> str:
        """
        Return a presigned download URL (15-minute TTL) for the document attachment.

        Raises:
            NoResultFound: Document not found or has no attachment
            PermissionError: User is not a trip member (checked by resource layer)
        """
        doc = db.session.query(TravelDocument).filter_by(id=UUID(document_id)).first()
        if not doc:
            raise NoResultFound(f"TravelDocument {document_id} not found")
        if not doc.attachment_path:
            raise NoResultFound("This document has no attachment")

        return StorageService.presigned_url(doc.attachment_path, "document", expires_in=900)
