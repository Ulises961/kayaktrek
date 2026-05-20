from typing import Optional, Dict, Any, List
from uuid import UUID

from camel_converter import dict_to_snake
from Models.day import Day
from Models.itinerary import Itinerary
from Models.sea import Sea
from Models.trip import Trip, TripStateType
from Models.weather import Weather
from Api.database import db
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import NoResultFound, IntegrityError
from datetime import date, time
import logging

from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)


def _require_editable(trip: Trip) -> None:
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("Cannot modify an itinerary on a completed trip")


class DayService:
    _MUTABLE_FIELDS = frozenset({"day_number", "date", "start_point_id", "end_point_id"})
    _MUTABLE_WEATHER_FIELDS = frozenset({"model"})
    _MUTABLE_SEA_FIELDS = frozenset({"moon_phase", "high_tide", "low_tide"})
    @staticmethod
    def get_day_by_id(day_id: str) -> Day:
        """
        Retrieve a day description with the different sea and weather states during that day.

        Params:
            day_id(int) id of the day entity
        Returns:
            The day with its sea and weather data

        Raises:
            NoResultFound: If no day exists
        """
        day = (
            db.session.query(Day)
            .options(
                selectinload(Day.sea).selectinload(Sea.sea_states),
                selectinload(Day.weather).selectinload(Weather.weather_states),
            )
            .filter_by(id=UUID(day_id))
            .first()
        )

        if not day:
            raise NoResultFound(f"Day with id {day_id} not found")

        return day

    @staticmethod
    def get_by_itinerary(itinerary_id: str) -> List[Day]:
        """
        Retrieve all days for a specific itinerary.

        Params:
            itinerary_id(int) id of the itinerary
        Returns:
            List of days belonging to the itinerary
        """
        days = (
            db.session.query(Day)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Itinerary.id == UUID(itinerary_id), Day.day_number != 0)
            .all()
        )
        return days

    @staticmethod
    def get_by_ids(day_ids: List[str]) -> List[Day]:
        """
        Retrieve days by their IDs.

        Params:
            day_ids: List of day IDs
        Returns:
            List of days
        """
        days = db.session.query(Day).filter(Day.id.in_([UUID(day_id) for day_id in day_ids])).all()
        return days

    @staticmethod
    def get_by_key(day_number: int, day_date: date, itinerary_id: str) -> Optional[Day]:
        """
        Retrieve a day by its composite key.

        Params:
            day_number: The day number
            day_date: The date of the day
            itinerary_id: The itinerary ID
        Returns:
            The day if found, None otherwise
        """
        day = (
            db.session.query(Day)
            .filter_by(day_number=day_number, date=day_date, itinerary_id=UUID(itinerary_id))
            .first()
        )
        return day

    @staticmethod
    def get_by_key_from_dict(body: dict) -> Optional[Day]:
        """
        Retrieve a day by its composite key from a raw request body dict.
        Handles camelCase conversion and date string parsing internally.

        Params:
            body: Raw request dict (camelCase keys, date as string or date object)
        Returns:
            The day if found, None otherwise
        """
        body = dict_to_snake(body)
        day_date = body['date']
        if isinstance(day_date, str):
            day_date = date.fromisoformat(day_date)
        return DayService.get_by_key(
            day_number=body['day_number'],
            day_date=day_date,
            itinerary_id=body['itinerary_id']
        )

    @staticmethod
    def create_day(day: Day) -> Day:
        """
        Create a new day.

        Params:
            day: Day object to create
        Returns:
            Created day object
        """
        itinerary = db.session.query(Itinerary).filter_by(id=day.itinerary_id).first()
        if itinerary and itinerary.trip_id:
            trip = db.session.query(Trip).filter_by(id=itinerary.trip_id).first()
            if trip:
                _require_editable(trip)
        db.session.add(day)
        db.session.commit()
        db.session.refresh(day)
        return day

    @staticmethod
    def update_day(day_id: str, day_data: Dict[str, Any]) -> Day:
        """
        Update an existing day with new data, including weather and sea information.

        Params:
            day_id: ID of the day to update
            day_data: Dictionary containing update data
        Returns:
            Updated day object
        Raises:
            NoResultFound: If day doesn't exist
            IntegrityError: If database constraints are violated
        """
        # Get the existing day
        existing_day = db.session.get(Day, UUID(day_id))

        if not existing_day:
            raise NoResultFound(f"Day with id {day_id} not found")
        
        # Check if nested objects are present in the request (even if None)
        has_weather_key = "weather" in day_data
        has_sea_key = "sea" in day_data

        # Extract and convert nested sub-objects; helpers expect snake_case keys
        weather_data = dict_to_snake(day_data["weather"]) if day_data.get("weather") else None
        sea_data = dict_to_snake(day_data["sea"]) if day_data.get("sea") else None

        # Update only whitelisted scalar fields
        for field in DayService._MUTABLE_FIELDS:
            key = camelcase(field)
            if key in day_data:
                value = day_data[key]
                if field == "date" and isinstance(value, str):
                    value = date.fromisoformat(value)
                setattr(existing_day, field, value)

        # Handle weather update/creation
        if has_weather_key:
            DayService._update_weather(existing_day, weather_data)

        # Handle sea update/creation
        if has_sea_key:
            DayService._update_sea(existing_day, sea_data)

        db.session.commit()
        db.session.refresh(existing_day)

        return existing_day

    @staticmethod
    def _update_weather(day: Day, weather_data: Optional[Dict[str, Any]]) -> None:
        """
        Update or create weather data for a day.

        Params:
            day: The day to update
            weather_data: Weather data dictionary or None to remove
        """
        if weather_data:  # Non-null weather data
            if day.weather:
                for field in DayService._MUTABLE_WEATHER_FIELDS:
                    if field in weather_data:
                        setattr(day.weather, field, weather_data[field])
            else:
                weather = Weather(**{k: v for k, v in weather_data.items() if k in DayService._MUTABLE_WEATHER_FIELDS})
                weather.day_id = day.id
                day.weather = weather
        else:  # Null weather data - remove association
            if day.weather:
                db.session.delete(day.weather)
                day.weather = None

    @staticmethod
    def _update_sea(day: Day, sea_data: Optional[Dict[str, Any]]) -> None:
        """
        Update or create sea data for a day.

        Params:
            day: The day to update
            sea_data: Sea data dictionary or None to remove
        """
        if sea_data:  # Non-null sea data
            if day.sea:
                for field in DayService._MUTABLE_SEA_FIELDS:
                    if field in sea_data:
                        value = sea_data[field]
                        if field in ("high_tide", "low_tide") and isinstance(value, str):
                            value = time.fromisoformat(value)
                        setattr(day.sea, field, value)
            else:
                safe = {k: v for k, v in sea_data.items() if k in DayService._MUTABLE_SEA_FIELDS}
                for field in ("high_tide", "low_tide"):
                    if field in safe and isinstance(safe[field], str):
                        safe[field] = time.fromisoformat(safe[field])
                sea = Sea(**safe)
                sea.day_id = day.id
                day.sea = sea
        else:  # Null sea data - remove association
            if day.sea:
                db.session.delete(day.sea)
                day.sea = None

    @staticmethod
    def delete_day(day_id: str) -> None:
        """
        Delete a day by its ID.

        Params:
            day_id: ID of the day to delete
        Raises:
            NoResultFound: If day doesn't exist
            IntegrityError: If deletion violates database constraints
        """
        day_to_delete = db.session.get(Day, UUID(day_id))

        if not day_to_delete:
            raise NoResultFound(f"Day with id {day_id} not found")

        db.session.delete(day_to_delete)
        db.session.commit()
        logger.info(f"Day with id {day_id} successfully deleted")
