
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from Models.base_model import BaseModel


class Image(BaseModel):
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # bytes
    location: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)  # MinIO URL

    def __repr__(self):
        return f'<Image "{self.name} @ {self.location}">'
