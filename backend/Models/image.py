
from sqlalchemy import Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from Models.base_model import BaseModel


class Image(BaseModel):
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self):
        return f'<Image "{self.name} @ {self.location}">'
