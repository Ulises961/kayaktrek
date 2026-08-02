from geoalchemy2 import Geography
from sqlalchemy import UUID, Numeric, Text, String, Enum, ForeignKey, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from Models.base_model import BaseModel
from Models.point_has_image import PointHasImage
from typing import Optional, List, TYPE_CHECKING
from uuid import UUID as _UUID

if TYPE_CHECKING:
    from Models.image import Image

class PointType(enum.Enum):
    STOP = 'stop'
    POSITION = 'position'

class Point(BaseModel):
    __table_args__ = (
        ForeignKeyConstraint(
            ['day_id'], ['day.id'], name="day_foreign_key_in_point", ondelete="CASCADE"
        ),
    )

    latitude: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    geo = mapped_column(
        Geography(geometry_type='POINT', srid=4326),
        nullable=True,
    )
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[Optional[PointType]] = mapped_column(
        Enum(PointType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    day_id: Mapped[Optional[_UUID]] = mapped_column(UUID, nullable=True, index=True)
    # SET NULL, not CASCADE: next_id points forward down the route chain, so
    # cascading would delete a point's predecessor when the successor goes.
    next_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey('point.id', ondelete="SET NULL"), nullable=True
    )

    next: Mapped[Optional['Point']] = relationship(
        'Point',
        foreign_keys=[next_id],
        remote_side='Point.id',
        uselist=False,
    )
    images: Mapped[List["Image"]] = relationship(
        secondary=PointHasImage, lazy="subquery", cascade='all, delete'
    )

    def __repr__(self):
        return f'<Point "({self.latitude}, {self.longitude}), type {self.type}">'
