from uuid import UUID as _UUID
from typing import TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User


class Block(BaseModel):
    """One-way, asymmetric block. "A blocks B" means, from A's side, B cannot see A's
    public profile/logs, find A in search, send A a buddy request or trip invite, or
    endorse A's logs. B is never told they are blocked (neutral 404/empty path).
    """

    __tablename__ = "block"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),
        CheckConstraint("blocker_id <> blocked_id", name="ck_block_not_self"),
    )

    blocker_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blocked_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    blocker: Mapped["User"] = relationship(
        "User", foreign_keys=[blocker_id], passive_deletes=True
    )
    blocked: Mapped["User"] = relationship(
        "User", foreign_keys=[blocked_id], passive_deletes=True
    )
