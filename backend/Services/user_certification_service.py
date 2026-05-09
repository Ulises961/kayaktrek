from typing import List
from uuid import UUID

from sqlalchemy.exc import NoResultFound
import logging

from Api.database import db
from Models.user import User
from Models.user_certification import UserCertification
from Schemas.user_certification_schema import UserCertificationSchema

logger = logging.getLogger(__name__)


class UserCertificationService:

    @staticmethod
    def list_certifications(user_id: str) -> List[UserCertification]:
        user: User | None = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User {user_id} not found")
        return user.certifications

    @staticmethod
    def add_certification(user_id: str, data: dict) -> UserCertification:
        user: User | None = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound(f"User {user_id} not found")

        cert: UserCertification = UserCertificationSchema().load(data)
        cert.user_id = UUID(user_id)

        db.session.add(cert)
        db.session.commit()
        logger.info("certification_added", extra={"user_id": user_id, "cert_id": str(cert.id)})
        return cert

    @staticmethod
    def delete_certification(user_id: str, cert_id: str) -> None:
        cert: UserCertification | None = (
            db.session.query(UserCertification)
            .filter_by(id=UUID(cert_id), user_id=UUID(user_id))
            .first()
        )
        if not cert:
            raise NoResultFound(f"Certification {cert_id} not found for user {user_id}")

        db.session.delete(cert)
        db.session.commit()
        logger.info("certification_deleted", extra={"user_id": user_id, "cert_id": cert_id})
