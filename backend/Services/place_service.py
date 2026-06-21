import logging
from typing import List
from uuid import UUID

from geoalchemy2.functions import ST_DWithin, ST_Distance
from sqlalchemy.exc import IntegrityError, NoResultFound

from Api.database import db
from Models.place import Place, PlaceVisibility
from Models.place_category import PlaceCategory

logger = logging.getLogger(__name__)

# Fields a create/PATCH may set on a Place.
_MUTABLE = ("location", "category_id", "label", "note")


class PlaceService:
    """Map places — standing geographic marks scoped to an itinerary. Creation is
    open to any trip member; editing and deletion are creator-only. The public
    community tier (itinerary_id null) is deferred to M7."""

    @staticmethod
    def list_categories() -> List[PlaceCategory]:
        return db.session.query(PlaceCategory).order_by(PlaceCategory.name).all()

    @staticmethod
    def create_category(data: dict) -> PlaceCategory:
        """Admin-only: extend the seeded catalogue. A duplicate slug or name trips the
        unique constraints — rollback and re-raise so the resource maps it to 409."""
        category = PlaceCategory(slug=data["slug"], name=data["name"], icon=data.get("icon"))
        db.session.add(category)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            raise
        logger.info("place_category_created", extra={"slug": category.slug})
        return category

    @staticmethod
    def get_by_id(place_id: str) -> Place:
        place = db.session.get(Place, place_id)
        if place is None:
            raise NoResultFound(f"Place {place_id} not found")
        return place

    @staticmethod
    def list_by_itinerary(itinerary_id: str) -> List[Place]:
        return db.session.query(Place).filter(Place.itinerary_id == UUID(itinerary_id)).all()

    @staticmethod
    def get_in_range(
        itinerary_id: str, range_km: float, longitude: float, latitude: float
    ) -> List[dict]:
        """Places of this itinerary within range_km of (longitude, latitude), nearest
        first, with distance_km attached. ST_DWithin on the GEOGRAPHY column (metres,
        GiST index) filters; ST_Distance gives the exact geodetic distance. This is
        the Place equivalent of the retired PointService.get_points_in_range."""
        center = f'SRID=4326;POINT({longitude} {latitude})'
        range_m = range_km * 1000
        distance_col = ST_Distance(Place.location, center).label('distance_m')
        rows = (
            db.session.query(Place, distance_col)
            .filter(Place.itinerary_id == UUID(itinerary_id))
            .filter(ST_DWithin(Place.location, center, range_m))
            .order_by(distance_col)
            .limit(100)
            .all()
        )
        return [
            {'place': place, 'distance_km': round(float(distance_m) / 1000, 3)}
            for place, distance_m in rows
        ]

    @staticmethod
    def create(itinerary_id: str, user_id: str, data: dict) -> Place:
        place = Place(
            itinerary_id=UUID(itinerary_id),
            created_by_user_id=UUID(user_id),
            visibility=PlaceVisibility.PRIVATE,
            **{key: value for key, value in data.items() if key in _MUTABLE},
        )
        db.session.add(place)
        db.session.commit()
        logger.info(
            "place_created", extra={"place_id": str(place.id), "itinerary_id": itinerary_id}
        )
        return place

    @staticmethod
    def update(place_id: str, user_id: str, data: dict) -> Place:
        place = PlaceService.get_by_id(place_id)
        PlaceService._assert_creator(place, user_id)
        for key in _MUTABLE:
            if key in data:
                setattr(place, key, data[key])
        db.session.commit()
        logger.info("place_updated", extra={"place_id": place_id})
        return place

    @staticmethod
    def delete(place_id: str, user_id: str) -> None:
        place = PlaceService.get_by_id(place_id)
        PlaceService._assert_creator(place, user_id)
        db.session.delete(place)
        db.session.commit()
        logger.info("place_deleted", extra={"place_id": place_id})

    @staticmethod
    def _assert_creator(place: Place, user_id: str) -> None:
        if place.created_by_user_id is None or str(place.created_by_user_id) != str(user_id):
            raise PermissionError("Only the creator can modify this place")
