from Api.database import Base
from sqlalchemy import UUID, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

class UserHasLog(Base):
    log_id: Mapped[int] = mapped_column(UUID, ForeignKey('log.id'), primary_key=True)
    user_id: Mapped[str] = mapped_column(UUID, ForeignKey('user.id'), primary_key=True)
