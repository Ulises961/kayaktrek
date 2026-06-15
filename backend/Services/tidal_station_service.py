import logging
from typing import List
from sqlalchemy.exc import NoResultFound
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from sqlalchemy import cast

from Api.database import db
from Models.tidal_station import TidalStation

logger = logging.getLogger(__name__)

_MUTABLE = frozenset({"name", "source", "notes", "mean_spring_range_m"})


class TidalStationService:
    @staticmethod
    def get_nearby(lat: float, lon: float, range_km: float) -> List[TidalStation]:
        radius_m = range_km * 1000.0
        ewkt = f"SRID=4326;POINT({lon} {lat})"
        return (
            db.session.query(TidalStation)
            .filter(ST_DWithin(cast(TidalStation.location, Geography), ewkt, radius_m))
            .all()
        )

    @staticmethod
    def create(station: TidalStation) -> TidalStation:
        db.session.add(station)
        db.session.commit()
        logger.info("tidal_station_created", extra={"station_id": str(station.id), "station_name": station.name})
        return station

    @staticmethod
    def get_by_id(station_id: str) -> TidalStation:
        station = db.session.get(TidalStation, station_id)
        if station is None:
            raise NoResultFound(f"TidalStation {station_id} not found")
        return station

    @staticmethod
    def update(station_id: str, data: dict) -> TidalStation:
        station = TidalStationService.get_by_id(station_id)
        for key in _MUTABLE:
            if key in data:
                setattr(station, key, data[key])
        db.session.commit()
        logger.info("tidal_station_updated", extra={"station_id": station_id})
        return station

    @staticmethod
    def delete(station_id: str) -> None:
        station = TidalStationService.get_by_id(station_id)
        db.session.delete(station)
        db.session.commit()
        logger.info("tidal_station_deleted", extra={"station_id": station_id})
