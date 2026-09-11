from typing import List, cast

from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape

from Services.tidal_station_service import TidalStationService
from Services.wind_diamond_service import WindDiamondService


class HazardDiamondService:
    """Position-only cross-trip view of tidal and wind diamonds (M27). Never
    returns content (name/notes/rate/direction) — see
    docs/adr/features.md "Revision (M27): position-only diamond sharing"."""

    @staticmethod
    def get_nearby_positions(lat: float, lng: float, range_km: float) -> List[dict]:
        tidal_stations = TidalStationService.get_nearby(lat, lng, range_km)
        wind_diamonds = WindDiamondService.get_nearby(lat, lng, range_km)

        positions = []
        for station in tidal_stations:
            # Atlas-seeded stations (itinerary_id is None) already have a full-content
            # public path via GET /tidal-station/nearby — only user-created diamonds
            # need this position-only tier.
            if station.itinerary_id is None or station.location is None:
                continue
            shape = to_shape(cast(WKBElement, station.location))
            positions.append({"id": str(station.id), "lat": shape.y, "lng": shape.x, "kind": "tidal"})

        for diamond in wind_diamonds:
            if diamond.location is None:
                continue
            shape = to_shape(cast(WKBElement, diamond.location))
            positions.append({"id": str(diamond.id), "lat": shape.y, "lng": shape.x, "kind": "wind"})

        return positions
