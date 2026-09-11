import logging
from typing import List
from uuid import UUID

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from sqlalchemy import cast
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.wind_diamond import WindDiamond

logger = logging.getLogger(__name__)

_MUTABLE = frozenset({"name", "location", "notes"})


class WindDiamondService:
    """Static wind-hazard reminder markers, scoped to one itinerary. Any trip
    member may create/edit/delete — access is gated at the itinerary-ownership
    layer (require_owner('wind_diamond')), same as tidal diamonds, not
    creator-only like Place."""

    @staticmethod
    def create(itinerary_id: str, user_id: str, data: dict) -> WindDiamond:
        diamond = WindDiamond(
            itinerary_id=UUID(itinerary_id),
            created_by_user_id=UUID(user_id),
            **{key: value for key, value in data.items() if key in _MUTABLE},
        )
        db.session.add(diamond)
        db.session.commit()
        logger.info(
            "wind_diamond_created",
            extra={"wind_diamond_id": str(diamond.id), "itinerary_id": itinerary_id},
        )
        return diamond

    @staticmethod
    def get_by_id(wind_diamond_id: str) -> WindDiamond:
        diamond = db.session.get(WindDiamond, wind_diamond_id)
        if diamond is None:
            raise NoResultFound(f"WindDiamond {wind_diamond_id} not found")
        return diamond

    @staticmethod
    def list_by_itinerary(itinerary_id: str) -> List[WindDiamond]:
        return db.session.query(WindDiamond).filter(
            WindDiamond.itinerary_id == UUID(itinerary_id)
        ).all()

    @staticmethod
    def get_nearby(lat: float, lon: float, range_km: float) -> List[WindDiamond]:
        radius_m = range_km * 1000.0
        ewkt = f"SRID=4326;POINT({lon} {lat})"
        return (
            db.session.query(WindDiamond)
            .filter(ST_DWithin(cast(WindDiamond.location, Geography), ewkt, radius_m))
            .all()
        )

    @staticmethod
    def update(wind_diamond_id: str, data: dict) -> WindDiamond:
        diamond = WindDiamondService.get_by_id(wind_diamond_id)
        for key in _MUTABLE:
            if key in data:
                setattr(diamond, key, data[key])
        db.session.commit()
        logger.info("wind_diamond_updated", extra={"wind_diamond_id": wind_diamond_id})
        return diamond

    @staticmethod
    def delete(wind_diamond_id: str) -> None:
        diamond = WindDiamondService.get_by_id(wind_diamond_id)
        db.session.delete(diamond)
        db.session.commit()
        logger.info("wind_diamond_deleted", extra={"wind_diamond_id": wind_diamond_id})
