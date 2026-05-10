from datetime import date
from typing import List
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.document import Document, DocumentType
from Models.trip import Trip
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase
from Schemas.document_schema import DocumentSchema

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = ("type", "name", "expiry_date", "notes")


def _require_editable_by_date(expiry_date) -> None:
    if expiry_date is not None and expiry_date < date.today():
        raise ValueError("This document's expiry date has passed and can no longer be edited")


class DocumentService:

    @staticmethod
    def list_for_trip(trip_id: str) -> List[Document]:
        return (
            db.session.query(Document)
            .filter_by(trip_id=UUID(trip_id))
            .order_by(Document.expiry_date.asc().nullslast())
            .all()
        )

    @staticmethod
    def create(trip_id: str, data: dict, user_id: str) -> Document:
        """
        Create a document. Any trip member can create; the creator becomes owner.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Trip not found
        """
        if not db.session.query(Trip).filter_by(id=UUID(trip_id)).first():
            raise NoResultFound(f"Trip {trip_id} not found")

        document: Document = DocumentSchema().load(data)
        document.trip_id = UUID(trip_id)
        document.owner_id = UUID(user_id)

        db.session.add(document)
        db.session.commit()
        db.session.refresh(document)
        logger.info("document_created", extra={
            "trip_id": trip_id, "document_id": str(document.id), "user_id": user_id,
        })
        return document

    @staticmethod
    def update(document_id: str, data: dict, user_id: str) -> Document:
        """
        Partially update a document. Membership is pre-validated by the resource layer.
        Only the owner or trip leader may update; record must not be past expiry.

        Raises:
            NoResultFound: Document not found
            PermissionError: User is neither owner nor leader
            ValueError: Document expiry date has passed
        """
        document = db.session.query(Document).filter_by(id=UUID(document_id)).first()
        if not document:
            raise NoResultFound(f"Document {document_id} not found")

        _require_editable_by_date(document.expiry_date)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=document.trip_id
        ).first()
        if membership.role != MemberRoleType.LEADER and document.owner_id != UUID(user_id):
            raise PermissionError("Only the document owner or trip leader can update this")

        for field in _UPDATABLE_FIELDS:
            key = camelcase(field)
            if key in data:
                value = data[key]
                if field == "type":
                    value = DocumentType(value)
                setattr(document, field, value)

        db.session.commit()
        db.session.refresh(document)
        logger.info("document_updated", extra={
            "document_id": document_id, "user_id": user_id,
        })
        return document

    @staticmethod
    def delete(document_id: str, user_id: str) -> None:
        """
        Delete a document. Membership is pre-validated by the resource layer.
        Only the owner or trip leader may delete; record must not be past expiry.

        Raises:
            NoResultFound: Document not found
            PermissionError: User is neither owner nor leader
            ValueError: Document expiry date has passed
        """
        document = db.session.query(Document).filter_by(id=UUID(document_id)).first()
        if not document:
            raise NoResultFound(f"Document {document_id} not found")

        _require_editable_by_date(document.expiry_date)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=document.trip_id
        ).first()
        if membership.role != MemberRoleType.LEADER and document.owner_id != UUID(user_id):
            raise PermissionError("Only the document owner or trip leader can delete this")

        db.session.delete(document)
        db.session.commit()
        logger.info("document_deleted", extra={
            "document_id": document_id, "user_id": user_id,
        })
