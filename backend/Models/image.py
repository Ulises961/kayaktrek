
from sqlalchemy import Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

from Models.base_model import BaseModel


class Image(BaseModel):
    # The original filename from the upload — metadata, never author-written.
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # What the photo shows, written by the author ("Parking above the slipway").
    # Optional: the gallery falls back to the point's own name and day rather than
    # showing an anonymous photo, because most authors will not write one.
    caption: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    def __repr__(self):
        return f'<Image "{self.name} @ {self.location}">'
