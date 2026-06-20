import logging
from typing import List, Optional
from sqlalchemy.exc import NoResultFound
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from sqlalchemy import cast

from Api.database import db
from Models.tidal_station import StreamEntryMode, TidalStation
from Services.tidal_service import TidalService

logger = logging.getLogger(__name__)

_MUTABLE = frozenset({"name", "source", "notes", "mean_spring_range_m"})

# Station fields a user may set/patch on their own diamond.
_DIAMOND_MUTABLE = frozenset({"name", "location", "source", "notes", "radius_m", "mean_spring_range_m"})

# Simple-mode peak inputs that drive rule-of-thirds synthesis of the hourly entries.
_SIMPLE_FIELDS = ("max_spring_rate_knots", "flood_direction_degrees", "ebb_direction_degrees")


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

    @staticmethod
    def _build_entries(data: dict) -> list:
        """
        Resolve the hourly TidalStreamEntry rows for a user diamond from its
        entry mode. Simple mode synthesises the 13 rows via the rule of thirds;
        advanced mode takes the supplied per-hour table verbatim.
        """
        if data.get("entry_mode") == StreamEntryMode.SIMPLE:
            missing = [f for f in _SIMPLE_FIELDS if data.get(f) is None]
            if missing:
                raise ValueError(f"Simple-mode diamond requires: {', '.join(missing)}")
            return TidalService.synthesise_stream_entries(
                max_spring_rate_knots=data["max_spring_rate_knots"],
                flood_direction_degrees=data["flood_direction_degrees"],
                ebb_direction_degrees=data["ebb_direction_degrees"],
                max_neap_rate_knots=data.get("max_neap_rate_knots"),
            )
        return data.get("tidal_stream_entries") or []

    @staticmethod
    def create_user_diamond(itinerary_id: str, user_id: str, data: dict) -> TidalStation:
        """
        Create a tidal diamond scoped to one itinerary, owned by the creating user.

        `data` is the validated diamond payload (station fields + entry_mode +
        either the simple-mode peak inputs or an advanced per-hour table).
        """
        station = TidalStation(
            itinerary_id=itinerary_id,
            created_by_user_id=user_id,
            entry_mode=data["entry_mode"],
            **{k: v for k, v in data.items() if k in _DIAMOND_MUTABLE},
        )
        station.tidal_stream_entries = TidalStationService._build_entries(data)
        db.session.add(station)
        db.session.commit()
        logger.info(
            "tidal_diamond_created",
            extra={
                "station_id": str(station.id),
                "itinerary_id": itinerary_id,
                "entry_mode": station.entry_mode.value if station.entry_mode else None,
            },
        )
        return station

    @staticmethod
    def get_diamond_edit_view(station_id: str) -> dict:
        """
        Build the raw editable view of a user diamond for form prefill.

        The resolved day-diamonds shape is lossy (rates are interpolated to a
        day's range at one hour), so an edit form cannot be populated from it.
        This returns the inputs the user originally supplied: the per-hour table
        verbatim, plus — for simple-mode diamonds — the peak rates and flood/ebb
        set reconstructed from the synthesised entries (peak = max rate; the set
        is carried on the mid-flood/mid-ebb hours at -3/+3 from HW).
        """
        station = TidalStationService.get_by_id(station_id)
        entries = sorted(station.tidal_stream_entries, key=lambda e: e.hours_from_hw)

        view = {
            "id": str(station.id),
            "name": station.name,
            "entry_mode": station.entry_mode.value if station.entry_mode else None,
            "radius_m": float(station.radius_m) if station.radius_m is not None else None,
            "is_user_created": station.is_user_created,
            "max_spring_rate_knots": None,
            "max_neap_rate_knots": None,
            "flood_direction_degrees": None,
            "ebb_direction_degrees": None,
            "tidal_stream_entries": entries,
        }

        if station.entry_mode == StreamEntryMode.SIMPLE and entries:
            by_hour = {e.hours_from_hw: e for e in entries}
            springs = [e.spring_rate_knots for e in entries if e.spring_rate_knots is not None]
            neaps = [e.neap_rate_knots for e in entries if e.neap_rate_knots is not None]
            max_spring = max(springs) if springs else None
            max_neap = max(neaps) if neaps else None
            view["max_spring_rate_knots"] = max_spring
            # Omit neap when it equals spring (no spring/neap swing) so the prefill
            # mirrors a creator who left the optional neap field blank.
            if max_neap is not None and max_spring is not None and abs(max_neap - max_spring) > 1e-9:
                view["max_neap_rate_knots"] = max_neap
            flood = by_hour.get(-3)
            ebb = by_hour.get(3)
            if flood is not None:
                view["flood_direction_degrees"] = flood.direction_degrees
            if ebb is not None:
                view["ebb_direction_degrees"] = ebb.direction_degrees

        return view

    @staticmethod
    def update_user_diamond(station_id: str, data: dict) -> TidalStation:
        """
        Patch a user diamond. Station fields update in place; if the entry mode
        or any stream input is present the hourly entries are fully rebuilt
        (orphan-cascade replaces the old rows).
        """
        station = TidalStationService.get_by_id(station_id)

        for key in _DIAMOND_MUTABLE:
            if key in data:
                setattr(station, key, data[key])

        new_mode: Optional[StreamEntryMode] = data.get("entry_mode")
        if new_mode is not None:
            station.entry_mode = new_mode

        rebuild = (
            new_mode is not None
            or any(k in data for k in _SIMPLE_FIELDS)
            or "max_neap_rate_knots" in data
            or "tidal_stream_entries" in data
        )
        if rebuild:
            resolved = {**data, "entry_mode": station.entry_mode}
            station.tidal_stream_entries = TidalStationService._build_entries(resolved)

        db.session.commit()
        logger.info("tidal_diamond_updated", extra={"station_id": station_id})
        return station
