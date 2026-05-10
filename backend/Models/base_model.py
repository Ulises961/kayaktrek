from datetime import datetime, timezone

from sqlalchemy import UUID, DateTime
from sqlalchemy.orm import Mapped, mapped_column
import uuid_extension
from Api.database import db
from uuid import UUID as _UUID

class BaseModel(db.Model):
    __abstract__ = True
    id: Mapped[_UUID] = mapped_column(
        UUID,
        primary_key=True,
        default=lambda: uuid_extension.uuid7(),
    )
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

