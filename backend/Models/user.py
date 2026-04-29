
from flask_bcrypt import generate_password_hash
from Models.base_model import BaseModel
from Models.inventory import Inventory
from Models.item import Item
from Models.itinerary import Itinerary
from Models.user_has_itinerary import user_has_itinerary
from Models.user_has_inventory import user_has_inventory
from Models.user_has_items import user_has_items
from Models.trip_member import TripMember
from Models.user_endorses_log import user_endorses_log
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from Models.log import Log
    from Models.trip import Trip
    from Models.auth_token import AuthToken
    from Models.invitation import Invitation


class User(BaseModel):
    __tablename__ = "users"

    def __init__(self, pwd=None, endorsed_logs=None, logs=None, id=None, **kwargs):
        if pwd:
            self.pwd = generate_password_hash(pwd).decode("UTF-8")

        self.endorsed_logs = endorsed_logs if endorsed_logs is not None else []
        self.logs = logs if logs is not None else []

        for key, value in kwargs.items():
            setattr(self, key, value)

    mail: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    pwd: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    surname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    admin: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False)

    # Association object: full role-aware access
    trip_memberships: Mapped[List["TripMember"]] = relationship(
        "TripMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    # Viewonly convenience relationship — use trip_memberships for mutations
    trips: Mapped[List["Trip"]] = relationship(
        secondary="trip_member", viewonly=True
    )
    received_invitations: Mapped[List["Invitation"]] = relationship(
        "Invitation",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    endorsed_logs: Mapped[List["Log"]] = relationship(
        secondary=user_endorses_log, back_populates="user_endorsed_logs"
    )
    logs: Mapped[List["Log"]] = relationship(back_populates="user_logs")
    itineraries: Mapped[List["Itinerary"]] = relationship(secondary=user_has_itinerary)
    inventories: Mapped[List["Inventory"]] = relationship(secondary=user_has_inventory)
    items: Mapped[List["Item"]] = relationship(secondary=user_has_items)
    auth_tokens: Mapped[List["AuthToken"]] = relationship(
        "AuthToken", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f'<User "{self.id} {self.mail}, {self.name}, {self.surname}, {self.pwd}">'
        )
