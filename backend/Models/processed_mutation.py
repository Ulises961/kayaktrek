from typing import Optional
from uuid import UUID as _UUID

from sqlalchemy import UUID, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class ProcessedMutation(BaseModel):
    """One offline change a phone has sent, and what became of it.

    `id` is the phone's own `mutation_id`, not a server-generated one: it is what makes
    a retried batch safe, since a change whose id is already here is answered from this
    row instead of being applied again. `created` is when it was processed. Rows are
    pruned after the retention window (Tasks/processed_mutation_task.py).
    """

    __tablename__ = "processed_mutation"
    # The retention prune deletes by age.
    __table_args__ = (Index("ix_processed_mutation_created", "created"),)

    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    # "applied" or "rejected" — a change that failed for a transient reason is not
    # recorded at all, so the phone's retry gets a real second attempt.
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
