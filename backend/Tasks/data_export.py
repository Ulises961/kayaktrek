"""
GDPR Art. 15 / 20 — data export task.

Assembles a JSON snapshot of all personal data for a user, writes it to
static/exports/<token_hash>.json, then emails a signed one-time download
link (24 h TTL).  The download endpoint streams the file, marks the token
used, and deletes the file.
"""
import hashlib
import json
import logging
import os
from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID

from Api.celery_app import celery_app
from Api.database import db
from flask import current_app
from Models.auth_token import AuthTokenType
from Models.user import User
from Services.auth_service import AuthService
from Services.mail_service import send_template_email

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="Tasks.data_export.export_user_data")
def export_user_data(self, user_id: str, request_id: str | None = None) -> None:
    logger.info("task_started", extra={"task_id": self.request.id, "request_id": request_id, "user_id": user_id})
    try:
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            logger.warning("export_user_not_found", extra={"user_id": user_id})
            return

        raw_token = AuthService._create_token(user.id, AuthTokenType.DATA_EXPORT)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        payload = json.dumps(_build_export(user), indent=2, default=_json_default)

        exports_dir = os.path.join(current_app.root_path, "static", "exports")
        os.makedirs(exports_dir, exist_ok=True)
        filepath = os.path.join(exports_dir, f"{token_hash}.json")
        with open(filepath, "w") as fh:
            fh.write(payload)

        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        download_url = f"{frontend_url}/download-export/{raw_token}"
        support_email = current_app.config.get("MAIL_DEFAULT_SENDER", "support@kayakplanner.app")

        send_template_email(
            user.mail,
            "Your Kayak Planner data export is ready",
            "data_export_ready",
            name=user.name,
            download_url=download_url,
            support_email=support_email,
        )

        logger.info("task_completed", extra={"task_id": self.request.id, "user_id": user_id})
    except Exception:
        logger.exception("task_failed", extra={"task_id": self.request.id, "request_id": request_id})
        raise


def _json_default(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serialisable")


def _build_export(user: User) -> dict:
    return {
        "exportedAt": datetime.now(UTC).isoformat(),
        "profile": {
            "id": str(user.id),
            "mail": user.mail,
            "username": user.username,
            "name": user.name,
            "surname": user.surname,
            "phone": user.phone,
            "avatarUrl": user.avatar_url,
            "admin": user.admin,
            "createdAt": user.created.isoformat() if user.created else None,
        },
        "vessel": {
            "make": user.vessel_make,
            "model": user.vessel_model,
            "lengthCm": user.vessel_length_cm,
            "colorPrimary": user.vessel_color_primary,
            "colorSecondary": user.vessel_color_secondary,
        },
        "emergencyContact": {
            "name": user.emergency_contact_name,
            "phone": user.emergency_contact_phone,
            "relationship": user.emergency_contact_relationship,
        },
        "medicalNotesConsentAt": user.medical_notes_consent_at.isoformat() if user.medical_notes_consent_at else None,
        "trips": [
            {
                "tripId": str(m.trip_id),
                "role": m.role.value,
                "floatPlanConfirmedAt": m.float_plan_confirmed_at.isoformat() if m.float_plan_confirmed_at else None,
                "vessel": {
                    "make": m.vessel_make,
                    "model": m.vessel_model,
                    "lengthCm": m.vessel_length_cm,
                    "colorPrimary": m.vessel_color_primary,
                    "colorSecondary": m.vessel_color_secondary,
                },
                "emergencyContact": {
                    "name": m.emergency_contact_name,
                    "phone": m.emergency_contact_phone,
                    "relationship": m.emergency_contact_relationship,
                },
            }
            for m in user.trip_memberships
        ],
        "logs": [
            {
                "id": str(log.id),
                "date": log.date.isoformat() if log.date else None,
                "distanceKm": cast(float, log.distance) if log.distance else None,
                "notes": log.notes,
            }
            for log in user.logs
        ],
        "endorsedLogs": [
            {
                "id": str(log.id),
                "date": log.date.isoformat() if log.date else None,
                "distanceKm": cast(float, log.distance) if log.distance else None,
                "notes": log.notes,
                "authorId": str(log.user_id) if log.user_id else None,
            }
            for log in user.endorsed_logs
        ],
        "certifications": [
            {
                "organization": c.organization,
                "award": c.award,
                "membershipNumber": c.membership_number,
                "awardedAt": c.awarded_at.isoformat() if c.awarded_at else None,
                "validUntil": c.valid_until.isoformat() if c.valid_until else None,
            }
            for c in user.certifications
        ],
    }
