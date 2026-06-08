import logging
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.sea import Sea

logger = logging.getLogger(__name__)

_MUTABLE = frozenset({"moon_phase", "high_tide", "low_tide", "tidal_range_m"})


class SeaService:
    @staticmethod
    def get_by_day_id(day_id: str) -> Sea:
        sea = db.session.query(Sea).filter_by(day_id=day_id).one_or_none()
        if sea is None:
            raise NoResultFound(f"Sea record not found for day {day_id}")
        return sea

    @staticmethod
    def create(day_id: str, data: dict) -> Sea:
        sea = Sea(day_id=day_id, **{k: v for k, v in data.items() if k in _MUTABLE})
        db.session.add(sea)
        db.session.commit()
        logger.info("sea_created", extra={"day_id": day_id})
        return sea

    @staticmethod
    def update(day_id: str, data: dict) -> Sea:
        sea = SeaService.get_by_day_id(day_id)
        for key in _MUTABLE:
            if key in data:
                setattr(sea, key, data[key])
        db.session.commit()
        logger.info("sea_updated", extra={"day_id": day_id})
        return sea
