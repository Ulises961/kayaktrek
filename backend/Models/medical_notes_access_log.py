from uuid import UUID as _UUID
from typing import TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip_member import TripMember


class MedicalNotesAccessLog(BaseModel):
    """One row per successful leader decrypt of a crew member's shared medical notes
    (ADR-023). An accountability record, not a security control on its own — it exists
    so the member whose notes these are can see who read them and when, turning the
    leader-decrypt path into something trustworthy rather than a black box.
    """

    __tablename__ = "medical_notes_access_log"

    trip_member_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip_member.id", ondelete="CASCADE"), nullable=False, index=True
    )
    leader_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    trip_member: Mapped["TripMember"] = relationship(passive_deletes=True)
    leader: Mapped["User"] = relationship(passive_deletes=True)
