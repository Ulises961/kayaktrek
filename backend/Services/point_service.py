"""
Point Service - Business logic for point operations.
"""
import logging
from typing import List, Optional, cast
from uuid import UUID
from geoalchemy2.functions import ST_DWithin, ST_Distance
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import selectinload

from Models.day import Day
from Models.itinerary import Itinerary
from Models.image import Image
from Models.point import Point, PointType
from Models.trip import Trip, TripStateType
from Schemas.base_schema import camelcase
from Schemas.image_schema import ImageSchema
from Schemas.point_schema import PointSchema
from Api.database import db

logger = logging.getLogger(__name__)


def _require_editable(trip: Trip) -> None:
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("Cannot modify an itinerary on a completed trip")


class PointService:
    """Service class for Point-related business logic."""
    _MUTABLE_FIELDS = frozenset({"type", "latitude", "longitude", "name", "notes"})
    
    @staticmethod
    def get_point_by_id(point_id: str) -> Optional[Point]:
        """
        Retrieve a point by its ID.
        
        Args:
            point_id: The ID of the point to retrieve
            
        Returns:
            Point object if found, None otherwise
            
        Raises:
            NoResultFound: If point doesn't exist
        """

        point = db.session.query(Point).filter_by(id=UUID(point_id)).first()
        if not point:
            logger.warning(f"Point with id {point_id} not found")
            raise NoResultFound(f"Point {point_id} not found in database")
        return point
    
    @staticmethod
    def get_all_points(itinerary_id:int) -> List[Point]:
        """
        Retrieve all points from the database.
        
        Params:
            itinerary_id(int) the id of the itinerary containing the points

        Returns:
            List of all Point objects
            
        Raises:
            NoResultFound: If no points exist
        """
        itinerary = db.session.query(Itinerary)\
            .options(selectinload(Itinerary.days).selectinload(Day.points))\
            .filter_by(id=itinerary_id)\
            .first()
        
        if not itinerary:
            raise NoResultFound(f"Itinerary {itinerary_id} not found in database")
        
        points = [point for day in itinerary.days if day.points is not None for point in day.points]

        if not points:
            logger.warning("No points found in database")
            raise NoResultFound("No points found in database")
        return points
    
    @staticmethod
    def _sync_geo(point: Point) -> None:
        """Populate the GEOGRAPHY column from latitude/longitude when both are set."""
        if point.latitude is not None and point.longitude is not None:
            point.geo = f'SRID=4326;POINT({float(point.longitude)} {float(point.latitude)})'
        else:
            point.geo = None

    @staticmethod
    def create_point(point_data: dict) -> Point:
        """
        Create a new point.

        Args:
            point_data: Dictionary containing point information

        Returns:
            Created Point object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new point")
        point: Point = cast(Point, PointSchema().load(point_data))
        day = db.session.query(Day).filter_by(id=point.day_id).first()
        itinerary = None
        if day:
            itinerary = db.session.query(Itinerary).filter_by(id=day.itinerary_id).first()
            if itinerary and itinerary.trip_id:
                trip = db.session.query(Trip).filter_by(id=itinerary.trip_id).first()
                if trip:
                    _require_editable(trip)
        PointService._sync_geo(point)
        db.session.add(point)
        db.session.flush()  # assign point.id before querying for the tail

        # Append to the tail of the ITINERARY-WIDE chain (not day-scoped).
        # apply_boundaries moves points from day 0 into numbered days; a day-scoped
        # search would find no tail in day 0 and leave the new point orphaned, causing
        # _walk_linked_list to miss it and reject the next apply-boundaries call.
        if itinerary:
            tail = (
                db.session.query(Point)
                .join(Day, Point.day_id == Day.id)
                .filter(
                    Day.itinerary_id == itinerary.id,
                    Point.next_id.is_(None),
                    Point.id != point.id,
                )
                .first()
            )
        else:
            tail = (
                db.session.query(Point)
                .filter(
                    Point.day_id == point.day_id,
                    Point.next_id.is_(None),
                    Point.id != point.id,
                )
                .first()
            )
        if tail:
            tail.next_id = point.id

        db.session.commit()
        db.session.refresh(point)
        logger.info(f"Point {point.id} created successfully")
        return point
    
    @staticmethod
    def update_point(point_id: str, point_data: dict) -> Point:
        """
        Update an existing point.
        
        Args:
            id: Integer ID of the updated point
            point_data: Dictionary containing point information with ID
            
        Returns:
            Updated Point object
            
        Raises:
            ValidationError: If data is invalid
            NoResultFound: If point doesn't exist
        """
        # Verify point exists
        existing_point = PointService.get_point_by_id(point_id)
        if not existing_point:
            raise NoResultFound(f"Point {point_id} not found")
        
        logger.info(f"Updating point {point_id}")

        coords_changed = False
        for field in PointService._MUTABLE_FIELDS:
            key = camelcase(field)
            if key in point_data:
                value = point_data[key]
                if field == "type" and isinstance(value, str):
                    value = PointType(value)
                setattr(existing_point, field, value)
                if field in ("latitude", "longitude"):
                    coords_changed = True

        if coords_changed:
            PointService._sync_geo(existing_point)

        # next_id: route ordering — patchable directly; day_id is not (security)
        if 'nextId' in point_data:
            existing_point.next_id = UUID(point_data['nextId']) if point_data['nextId'] else None
        elif 'next' in point_data:
            next_val = point_data['next']
            if next_val is None:
                existing_point.next_id = None
            elif isinstance(next_val, dict):
                existing_point.next_id = UUID(next_val['id'])
            else:
                existing_point.next_id = UUID(next_val)

        # Handle images relationship — nullable sub-collection
        if 'images' in point_data:
            existing_point.images = [
                cast(Image, ImageSchema().load(img)) for img in (point_data['images'] or [])
            ]
        
        db.session.commit()
        db.session.refresh(existing_point)      
  
        return existing_point
    
    @staticmethod
    def delete_point(point_id: str) -> None:
        """
        Delete a point by its ID.
        
        Args:
            point_id: The ID of the point to delete
            
        Raises:
            NoResultFound: If point doesn't exist
        """
        point = PointService.get_point_by_id(point_id)
        logger.info("point_delete", extra={"point_id": point_id})

        predecessor = db.session.query(Point).filter_by(next_id=UUID(point_id)).first()
        if predecessor:
            predecessor.next_id = point.next_id

        db.session.delete(point)
        db.session.commit()
        logger.info("point_deleted", extra={"point_id": point_id})
    
    @staticmethod
    def get_points_by_day(day_id: str) -> List[Point]:
        """
        Retrieve all points for a specific day.
        
        Args:
            day_id: The ID of the day
            
        Returns:
            List of Point objects for that day
        """
        points = db.session.query(Point).filter_by(day_id=UUID(day_id)).all()
        logger.info(f"Found {len(points)} points for day {day_id}")
        return points

    @staticmethod
    def get_points_in_range(range_km: float, longitude: float, latitude: float) -> List[dict]:
        """
        Return all INTEREST points within range_km of (longitude, latitude),
        ordered by ascending distance, with distance_km attached.

        Uses ST_DWithin on the GEOGRAPHY column (metres) with the GiST index,
        then ST_Distance for the exact geodetic distance in the SELECT list.
        """
        center = f'SRID=4326;POINT({longitude} {latitude})'
        range_m = range_km * 1000
        distance_col = ST_Distance(Point.geo, center).label('distance_m')

        rows = (
            db.session.query(Point, distance_col)
            .filter(Point.type == PointType.INTEREST)
            .filter(Point.geo.isnot(None))
            .filter(ST_DWithin(Point.geo, center, range_m))
            .order_by(distance_col)
            .limit(100)
            .all()
        )

        return [
            {'point': point, 'distance_km': round(float(distance_m) / 1000, 3)}
            for point, distance_m in rows
        ]