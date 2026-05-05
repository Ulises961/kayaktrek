"""
Privileges Middleware - Resource ownership verification.

This module provides functions to verify that a user has access to specific resources
by checking ownership chains through the database relationships.
"""

from functools import wraps
from http import HTTPStatus
import logging
from typing import Optional
from uuid import UUID

from flask import abort, g, request
from sqlalchemy.exc import NoResultFound
from Api.database import db
from Models.user import User
from Models.trip import Trip
from Models.itinerary import Itinerary
from Models.day import Day
from Models.sea import Sea
from Models.weather import Weather
from Models.inventory import Inventory
from Models.item import Item
from Models.point import Point
from Models.log import Log
from Models.image import Image
from Models.trip_member import TripMember, MemberRoleType
from Models.user_has_inventory import user_has_inventory
from Services.day_service import DayService
from Services.itinerary_service import ItineraryService
from Services.trip_service import TripService

logger = logging.getLogger(__name__)


def require_admin():
    """
    Decorator that allows only admin users to call the endpoint.
    Looks up the user from the DB; admins bypass all ownership checks.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            current_user_id = g.get("current_user_id")
            if not current_user_id:
                abort(HTTPStatus.UNAUTHORIZED, description="Authentication required")
            user = db.session.query(User).filter_by(id=UUID(current_user_id)).first()
            if not user or not user.admin:
                abort(HTTPStatus.FORBIDDEN, description="Admin access required")
            return f(*args, **kwargs)
        return wrapper
    return decorator


def require_self(id_param: str = "id"):
    """
    Decorator that requires the authenticated user to be the same user identified
    by the URL parameter ``id_param``. Admins bypass the check.
    """

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            current_user_id = g.get("current_user_id")
            target_id = kwargs.get(id_param)
            if not current_user_id:
                abort(HTTPStatus.UNAUTHORIZED, description="Authentication required")
            if current_user_id != target_id:
                abort(HTTPStatus.FORBIDDEN, description="Access denied")
            return f(*args, **kwargs)

        return wrapper

    return decorator


def require_leader(id_param: str = "id"):
    """
    Decorator that requires the current user to be the leader of the trip.

    Must be stacked after @require_owner('trip'), which already confirms membership.
    Reads the trip id from the URL parameter named ``id_param``.

    Returns 403 if the user is crew (not a leader).
    """

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user_id = g.get("current_user_id")
            trip_id = kwargs.get(id_param)
            if not user_id or not trip_id:
                abort(HTTPStatus.BAD_REQUEST, description="Trip id required")

            membership = (
                db.session.query(TripMember)
                .filter_by(user_id=UUID(user_id), trip_id=UUID(trip_id))
                .first()
            )
            if not membership or membership.role != MemberRoleType.LEADER:
                abort(
                    HTTPStatus.FORBIDDEN,
                    description="Only trip leaders can perform this action",
                )
            return f(*args, **kwargs)

        return wrapper

    return decorator


def require_owner(
    resource_type, *, id_param="id", from_body=False, parent_resource=None, read_only=False
):
    """
    Decorator to ensure user owns the resource or has access to it.

    This decorator verifies that the authenticated user has permission to access
    the requested resource by checking the ownership chain in the database.

    Args:
        resource_type: Type of resource ('trip', 'itinerary', 'day', 'sea', 'weather',
                        'inventory', 'item', 'point', 'log', 'image')
        id_param: Name of the parameter containing the resource ID (default: 'id')
        from_body: If True, extract id_param from request body instead of URL (default: False)
        parent_resource: Tuple of (parent_type, parent_id_param) to check parent ownership
                         for create operations. E.g., ('itinerary', 'itinerary_id')

    Examples:
        # GET /api/day/<id> - Check day ownership from URL
        @require_owner('day')

        # POST /api/day/create with {"itinerary_id": 5} - Check itinerary ownership from body
        @require_owner('day', parent_resource=('itinerary', 'itinerary_id'), from_body=True)

        # PUT /api/day/<id>/update with body - Check day ownership from URL
        @require_owner('day', id_param='id')
    """

    def decorator(f):
        @wraps(f)
        def decorator_function(*args, **kwargs):
            # Get current user from g (set by authenticate_restful)
            user_id = g.get("current_user_id")
            if not user_id:
                abort(HTTPStatus.UNAUTHORIZED, description="Authentication required")

            # Determine which resource to check
            if parent_resource:
                # For create operations, check parent resource ownership
                parent_type, parent_id_field = parent_resource

                if from_body:
                    data = request.get_json()
                    if not data:
                        abort(
                            HTTPStatus.BAD_REQUEST, description="Request body required"
                        )
                    resource_id = data.get(parent_id_field)
                else:
                    resource_id = kwargs.get(parent_id_field)

                if not resource_id:
                    abort(
                        HTTPStatus.BAD_REQUEST,
                        description=f"{parent_id_field} required",
                    )

                check_type = parent_type
            else:
                # For read/update/delete operations, check the resource itself
                if from_body:
                    data = request.get_json()
                    if not data:
                        abort(
                            HTTPStatus.BAD_REQUEST, description="Request body required"
                        )
                    resource_id = data.get(id_param)
                else:
                    resource_id = kwargs.get(id_param)

                if not resource_id:
                    abort(
                        HTTPStatus.BAD_REQUEST,
                        description=f"Resource ID ({id_param}) required",
                    )

                check_type = resource_type

            # Check if user owns or has access to the resource
            has_access = check_resource_ownership(
                resource_type=check_type, resource_id=resource_id, read_only=read_only
            )

            if has_access is None:
                # Resource doesn't exist - let endpoint handle it (will return 404)
                return f(*args, **kwargs)
            elif not has_access:
                abort(
                    HTTPStatus.FORBIDDEN,
                    description=f"Access denied to {check_type} {resource_id}",
                )

            return f(*args, **kwargs)

        return decorator_function

    return decorator


def check_resource_ownership(resource_type: str, resource_id: str, read_only: bool = False) -> Optional[bool]:
    """
    Check if a user has ownership or access rights to a specific resource.

    This function verifies the ownership chain by traversing database relationships
    from the resource back to the user.

    Args:
        user_id: The id of the user
        resource_type: Type of resource ('trip', 'itinerary', 'day', 'sea', 'weather', etc.)
        resource_id: The ID of the resource (can be int or string for resources using id)

    Returns:
        True if user has access, False if user lacks permission, None if resource doesn't exist
    """
    try:
        # Check ownership based on resource type
        if resource_type == "trip":
            return _check_trip_ownership(g.current_user_id, resource_id)

        elif resource_type == "itinerary":
            return _check_itinerary_ownership(g.current_user_id, resource_id, read_only=read_only)

        elif resource_type == "day":
            return _check_day_ownership(g.current_user_id, resource_id)

        elif resource_type == "sea":
            return _check_sea_ownership(g.current_user_id, resource_id)

        elif resource_type == "weather":
            return _check_weather_ownership(g.current_user_id, resource_id)

        elif resource_type == "inventory":
            return _check_inventory_ownership(g.current_user_id, resource_id)

        elif resource_type == "item":
            return _check_item_ownership(g.current_user_id, resource_id)

        elif resource_type == "point":
            return _check_point_ownership(g.current_user_id, resource_id)

        elif resource_type == "log":
            return _check_log_ownership(g.current_user_id, str(resource_id))

        elif resource_type == "image":
            return _check_image_ownership(g.current_user_id, str(resource_id))

        else:
            logger.error(f"Unknown resource type: {resource_type}")
            return False

    except ValueError:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid resource ID format")
    except NoResultFound:
        return None  # resource doesn't exist — let the endpoint return 404
    except Exception as e:
        logger.error(f"Error checking ownership: {e}")
        return False


def _check_trip_ownership(user_id: str, trip_id: str) -> Optional[bool]:
    """Check if user owns or is a companion on the trip."""

    # First check if trip exists by id
    trip = TripService.get_trip_by_id(trip_id)
    if not trip:
        return None  # Trip doesn't exist

    # Check if user is associated with trip
    result = (
        db.session.query(Trip)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Trip.id == trip.id, TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_itinerary_ownership(user_id: str, itinerary_id: str, *, read_only: bool = False) -> Optional[bool]:
    """Check if user owns the itinerary through trip ownership."""

    # First check if itinerary exists
    itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
    if not itinerary:
        return None  # Itinerary doesn't exist

    # Public itineraries are readable by anyone; mutations still require membership
    if itinerary.is_public and read_only:
        return True
    
    result = (
        db.session.query(Itinerary)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Itinerary.id == itinerary.id, TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_day_ownership(user_id: str, day_id: str) -> Optional[bool]:
    """Check if user owns the day through itinerary/trip ownership."""
    # First check if day exists
    day = db.session.query(Day).filter_by(id=UUID(day_id)).first()
    if not day:
        return None  # Day doesn't exist

    # Check on draft itinerary
    result = (
        db.session.query(Day)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .filter(Day.id == UUID(day_id), Itinerary.user_id == UUID(user_id))
        .first()
    )
    if result is not None:
        return True
    
    # Check on trip itinerary
    result = (
        db.session.query(Day)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Day.id == UUID(day_id), TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_sea_ownership(user_id: str, sea_id: str) -> Optional[bool]:
    """Check if user owns the sea through day/itinerary/trip ownership."""
    # First check if sea exists
    sea = db.session.query(Sea).filter_by(id=UUID(sea_id)).first()
    if not sea:
        return None  # Sea doesn't exist

    result = (
        db.session.query(Sea)
        .join(Day, Sea.day_id == Day.id)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Sea.day_id == UUID(sea_id), TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_weather_ownership(user_id: str, weather_id: str) -> Optional[bool]:
    """Check if user owns the weather through day/itinerary/trip ownership."""
    # First check if weather exists
    weather = db.session.query(Weather).filter_by(id=UUID(weather_id)).first()
    if not weather:
        return None  # Weather doesn't exist

    result = (
        db.session.query(Weather)
        .join(Day, Weather.day_id == Day.id)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Weather.day_id == UUID(weather_id), TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_inventory_ownership(user_id: str, inventory_id: str) -> Optional[bool]:
    """Check if user owns the inventory directly, through user_has_inventory, or through trip ownership."""

    # First check if inventory exists
    inventory = db.session.query(Inventory).filter_by(id=UUID(inventory_id)).first()
    if not inventory:
        return None  # Inventory doesn't exist

    # Check direct ownership via inventory.user_id FK
    if inventory.user_id == UUID(user_id):
        return True

    result = (
        db.session.query(Inventory)
        .join(Trip, Inventory.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Inventory.id == inventory_id, TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_item_ownership(user_id: str, item_id: str) -> Optional[bool]:
    """Check if the current user is the owner of the item."""
    item = db.session.query(Item).filter_by(id=UUID(item_id)).first()
    if not item:
        return None
    return item.user_id == UUID(user_id) if item.user_id else False


def _check_point_ownership(user_id: str, point_id: str) -> Optional[bool]:
    """Check if user owns the point through day/itinerary/trip ownership."""
    # First check if point exists
    point = db.session.query(Point).filter_by(id=UUID(point_id)).first()
    if not point:
        return None  # Point doesn't exist

    # Check user owns draft itinerary
    result = (
            db.session.query(Point)
            .join(Day, Point.day_id == Day.id)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Point.id == UUID(point_id), Itinerary.user_id == UUID(user_id))
            .first()
        )
    
    if result:
        return True
    
    # Check user belongs to trip with such itinerary
    result = (
        db.session.query(Point)
        .join(Day, Point.day_id == Day.id)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .join(TripMember, Trip.id == TripMember.trip_id)
        .filter(Point.id == UUID(point_id), TripMember.user_id == UUID(user_id))
        .first()
    )

    return result is not None


def _check_log_ownership(user_id: str, log_id: str) -> Optional[bool]:
    """Check if user owns or has access to the log."""
    # log_id is actually a id (string)
    log = db.session.query(Log).filter_by(id=UUID(log_id)).first()
    if not log:
        return None  # Log doesn't exist

    # Check if user is the log author
    return (
        db.session.query(User)
        .join(User.logs)
        .filter(User.id == UUID(user_id), Log.id == UUID(log_id))
        .first()
        is not None
    )


def _check_image_ownership(user_id: str, image_id: str) -> Optional[bool]:
    """Check if user owns the image through point or user ownership."""
    image = db.session.query(Image).filter_by(id=UUID(image_id)).first()
    if not image:
        return None  # Image doesn't exist

    # Check if image belongs to user's point or is user's profile picture
    # This depends on your specific image relationships
    # For now, check if user owns related points
    points_with_image = (
        db.session.query(Point).join(Point.images).filter(Image.id == UUID(image_id)).all()
    )

    for point in points_with_image:
        if _check_point_ownership(user_id, str(point.id)):
            return True

    return False
