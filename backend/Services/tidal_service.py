import logging
import math
from datetime import datetime, time, timedelta
from typing import Optional

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from sqlalchemy import cast

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import PointType
from Models.sea import Sea
from Models.tidal_station import TidalStation
from Models.tidal_stream_entry import TidalStreamEntry
from Services.Utils.geo_utils import haversine_nm

logger = logging.getLogger(__name__)

# Cumulative fractions at each hour from LW: 0, 1/12, 3/12, 6/12, 9/12, 11/12, 12/12
_RULE_12_FRACTIONS = [0.0, 1 / 12, 3 / 12, 6 / 12, 9 / 12, 11 / 12, 1.0]

# Per-hour rate fractions normalized to peak (h=2 or h=3): [1/3, 2/3, 1, 1, 2/3, 1/3]
# max_spring_rate_knots is treated as the peak current speed.
_STREAM_FRACTIONS = [1 / 3, 2 / 3, 1.0, 1.0, 2 / 3, 1 / 3]

# Assumed paddling start (minutes from midnight) when no explicit start time exists
_DEFAULT_START_MIN = 9 * 60  # 09:00


def _build_uniform_velocity_grid(
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
    rate_ms: float,
    direction_deg: float,
    source: str,
) -> dict:
    """Build a 3x3 uniform leaflet-velocity grid from speed (m/s) + direction."""
    rad = math.radians(direction_deg)
    u = round(rate_ms * math.sin(rad), 5)
    v = round(rate_ms * math.cos(rad), 5)

    nx, ny = 3, 3
    n = nx * ny
    dx = round((lon_max - lon_min) / (nx - 1), 4) if nx > 1 else 0.0
    dy = round((lat_max - lat_min) / (ny - 1), 4) if ny > 1 else 0.0

    header_base = {
        "parameterUnit": "m.s-1",
        "la1": lat_max, "la2": lat_min,
        "lo1": lon_min, "lo2": lon_max,
        "nx": nx, "ny": ny,
        "dx": dx, "dy": dy,
    }
    return {
        "source": source,
        "grid": [
            {
                "header": {**header_base, "parameterCategory": 2, "parameterNumber": 2, "parameterNumberName": "eastward_component"},
                "data": [u] * n,
            },
            {
                "header": {**header_base, "parameterCategory": 2, "parameterNumber": 3, "parameterNumberName": "northward_component"},
                "data": [v] * n,
            },
        ],
    }


def _rule_12_height(scaled_hours: float, range_m: float) -> float:
    """
    Height above LW from a rule-of-12s position and the tidal range.

    The rule of 12s divides the flood into 6 equal steps with fractional rises of
    1, 2, 3, 3, 2, 1 twelfths of the range per step (cumulative: 0, 1/12, 3/12,
    6/12, 9/12, 11/12, 12/12).  This function uses linear interpolation between
    steps so fractional positions return smooth values.

    `scaled_hours` is a position on the normalised 0–6 scale — it is NOT actual
    wall-clock hours.  Callers must map actual elapsed time to this scale first
    (see `height_at`).
    """
    scaled_hours = max(0.0, min(scaled_hours, 6.0))
    lower = int(scaled_hours)
    if lower >= 6:
        return range_m
    frac = scaled_hours - lower
    fraction = _RULE_12_FRACTIONS[lower] + frac * (_RULE_12_FRACTIONS[lower + 1] - _RULE_12_FRACTIONS[lower])
    return fraction * range_m


def _half_cycle_h(from_min: int, to_min: int) -> float:
    """
    Actual tidal half-cycle duration in hours between two clock times (minutes from midnight).

    Takes the shorter of the two possible arcs on the 24-hour clock.  This is
    necessary because tidal half-cycles are always < 12 hours: without it a
    midnight-spanning flood like LW 22:00 → HW 04:00 would be computed as 18 h
    instead of 6 h.
    """
    diff = (to_min - from_min) % (24 * 60)
    return min(diff, 24 * 60 - diff) / 60.0


class TidalService:

    @staticmethod
    def height_at(sea: Sea, t: time) -> Optional[float]:
        """
        Estimated height above LW at time t using the rule of 12s.

        The rule of 12s was originally defined for a 6-hour tidal half-cycle, which
        is typical of the British Isles but does not hold everywhere.  This
        implementation proportionally scales actual elapsed time onto the 0–6
        normalised scale so the same table works for any half-cycle duration:

            scaled = elapsed_hours / half_cycle_h * 6

        The Sea record stores one HW and one LW time (no dates).  When t falls
        outside the recorded half-cycle, the missing boundary is inferred by
        assuming the preceding half-cycle had the same duration (flood ≈ ebb),
        which is the same approximation the rule of 12s already makes.

        Returns None when high_tide, low_tide, or tidal_range_m is absent.
        """
        if sea.high_tide is None or sea.low_tide is None or sea.tidal_range_m is None:
            return None

        range_m = sea.tidal_range_m
        hw_min = sea.high_tide.hour * 60 + sea.high_tide.minute
        lw_min = sea.low_tide.hour * 60 + sea.low_tide.minute
        t_min = t.hour * 60 + t.minute

        if lw_min <= hw_min:
            # LW is recorded before HW → the flood [lw_min, hw_min] is explicit
            half_h = _half_cycle_h(lw_min, hw_min)
            if half_h == 0:
                return range_m / 2  # degenerate data: HW == LW

            if lw_min <= t_min <= hw_min:
                # Flood phase: map actual elapsed time onto the 0–6 rule-of-12s scale
                scaled = (t_min - lw_min) / 60.0 * 6.0 / half_h
                return _rule_12_height(scaled, range_m)
            elif t_min > hw_min:
                # Ebb phase after HW; ebb duration assumed equal to flood
                scaled = (t_min - hw_min) / 60.0 * 6.0 / half_h
                return range_m - _rule_12_height(min(scaled, 6.0), range_m)
            else:
                # t is before LW — we are in the ebb from the preceding HW.
                # Infer that HW occurred one half-cycle before the recorded LW.
                hours_from_prev_hw = (t_min - (lw_min - half_h * 60)) / 60.0
                if hours_from_prev_hw < 0:
                    hours_from_prev_hw += 24  # midnight wrap
                scaled = hours_from_prev_hw * 6.0 / half_h
                return range_m - _rule_12_height(min(scaled, 6.0), range_m)
        else:
            # HW is recorded before LW → the ebb [hw_min, lw_min] is explicit
            half_h = _half_cycle_h(hw_min, lw_min)
            if half_h == 0:
                return range_m / 2  # degenerate data: HW == LW

            if hw_min <= t_min <= lw_min:
                # Ebb phase: map actual elapsed time onto the 0–6 rule-of-12s scale
                scaled = (t_min - hw_min) / 60.0 * 6.0 / half_h
                return range_m - _rule_12_height(scaled, range_m)
            elif t_min < hw_min:
                # t is before HW — we are in the flood leading up to this HW.
                # Infer that LW occurred one half-cycle before the recorded HW.
                hours_from_prev_lw = (t_min - (hw_min - half_h * 60)) / 60.0
                if hours_from_prev_lw < 0:
                    hours_from_prev_lw += 24  # midnight wrap
                scaled = hours_from_prev_lw * 6.0 / half_h
                return _rule_12_height(min(scaled, 6.0), range_m)
            else:
                # t is after LW — flood has resumed towards the next HW
                scaled = (t_min - lw_min) / 60.0 * 6.0 / half_h
                return _rule_12_height(min(scaled, 6.0), range_m)

    @staticmethod
    def rule_of_twelfths(sea: Sea) -> Optional[list]:
        """
        7-entry LW-to-HW breakdown table scaled to the actual flood duration.

        The rule of 12s defines 6 equal steps regardless of how long the flood
        takes.  `hour_from_lw` in each entry is the real wall-clock time elapsed
        from LW — not the step index — so a paddler reading the table sees actual
        hours they can compare against their watch or tide tables.

        For a 6 h flood: steps land at 0, 1, 2, 3, 4, 5, 6 h.
        For a 4 h flood: steps land at 0, 0.67, 1.33, 2.0, 2.67, 3.33, 4.0 h.

        Returns None when tidal data is absent.
        """
        if sea.high_tide is None or sea.low_tide is None or sea.tidal_range_m is None:
            return None

        range_m = sea.tidal_range_m
        hw_min = sea.high_tide.hour * 60 + sea.high_tide.minute
        lw_min = sea.low_tide.hour * 60 + sea.low_tide.minute
        # Use the shorter arc between LW and HW as the flood duration
        half_h = _half_cycle_h(lw_min, hw_min)
        step_h = half_h / 6.0  # actual hours per rule-of-12s step

        return [
            {
                "hour_from_lw": round(h * step_h, 2),
                "cumulative_fraction": _RULE_12_FRACTIONS[h],
                "estimated_height_m": round(_RULE_12_FRACTIONS[h] * range_m, 3),
            }
            for h in range(7)
        ]

    @staticmethod
    def interpolate_stream_rate(entry: TidalStreamEntry, sea: Sea) -> Optional[float]:
        """
        Interpolate stream rate between neap and spring using the day's actual tidal range
        relative to the station's mean spring range.
        Falls back to spring_rate_knots when mean_spring_range_m is absent.
        """
        if entry.spring_rate_knots is None:
            return None

        spring_rate = entry.spring_rate_knots

        if sea.tidal_range_m is None:
            return spring_rate

        station = entry.station
        if station is None or station.mean_spring_range_m is None:
            return spring_rate

        spring_range = station.mean_spring_range_m
        if spring_range == 0:
            return spring_rate

        neap_rate = entry.neap_rate_knots if entry.neap_rate_knots is not None else 0.0
        ratio = min(sea.tidal_range_m / spring_range, 1.0)
        return neap_rate + ratio * (spring_rate - neap_rate)

    @staticmethod
    def build_wind_velocity_grid(bounding_box: tuple, weather_states: list, hour: int) -> dict:
        """
        Build a leaflet-velocity grid from WeatherState data at the given UTC hour.

        wind_force is stored in km/h (OpenMeteo default). Converts to m/s for the grid.
        Falls back to the closest available state when no exact hour match exists.
        Returns {"source": "weather", "grid": [...]} or {"source": "weather", "grid": []}.
        """
        if not weather_states:
            return {"source": "weather", "grid": []}

        def _hour_of(state) -> int:
            return state.time.hour if hasattr(state.time, "hour") else 0

        best = min(weather_states, key=lambda s: abs(_hour_of(s) - hour))
        if best.wind_force is None or best.wind_direction is None:
            return {"source": "weather", "grid": []}

        speed_ms = float(best.wind_force) / 3.6  # km/h → m/s
        lat_min, lat_max, lon_min, lon_max = bounding_box
        return _build_uniform_velocity_grid(
            lat_min, lat_max, lon_min, lon_max,
            speed_ms,
            float(best.wind_direction),
            "weather",
        )

    @staticmethod
    def build_wave_velocity_grid(bounding_box: tuple, sea_states: list, hour: int) -> dict:
        """
        Build a leaflet-velocity grid from SeaState wave data at the given UTC hour.

        wave_height (m) is used as a proxy for speed magnitude (1 m ≈ 1 m/s visually).
        Falls back to closest available state when no exact hour match exists.
        Returns {"source": "marine", "grid": [...]} or {"source": "marine", "grid": []}.
        """
        if not sea_states:
            return {"source": "marine", "grid": []}

        def _hour_of(state) -> int:
            return state.time.hour if hasattr(state.time, "hour") else 0

        best = min(sea_states, key=lambda s: abs(_hour_of(s) - hour))
        if best.wave_height is None or best.wave_direction is None:
            return {"source": "marine", "grid": []}

        lat_min, lat_max, lon_min, lon_max = bounding_box
        speed_ms = float(best.wave_height)  # metres → treat directly as m/s for visualisation
        return _build_uniform_velocity_grid(
            lat_min, lat_max, lon_min, lon_max,
            speed_ms,
            float(best.wave_direction),
            "marine",
        )

    @staticmethod
    def stream_rate_from_sea(sea: Sea, hour_from_lw: int) -> Optional[tuple]:
        """
        Returns (rate_knots, direction_degrees) using rule-of-12s fractions and
        the manual stream fields on the Sea record.

        max_spring_rate_knots is the peak rate (at hours 2-3 from LW).
        Hours 0-5 → flood direction; hours 6-11 → ebb direction.
        Returns None if any required field is absent.
        """
        if (sea.flood_direction_degrees is None
                or sea.ebb_direction_degrees is None
                or sea.max_spring_rate_knots is None):
            return None

        h = int(hour_from_lw) % 12
        fraction_idx = h if h < 6 else 11 - h
        fraction = _STREAM_FRACTIONS[max(0, min(fraction_idx, 5))]

        rate = fraction * float(sea.max_spring_rate_knots)
        direction = (float(sea.flood_direction_degrees) if h < 6
                     else float(sea.ebb_direction_degrees))
        return rate, direction

    @staticmethod
    def build_stream_velocity_grid(
        bounding_box: tuple,
        hour_from_lw: int,
        sea: Optional[Sea],
        stations: list,
    ) -> dict:
        """
        Build a leaflet-velocity compatible velocity grid dict.

        Priority: TidalStation entry data > Sea manual stream fields.
        Returns { "source": "station"|"manual"|None, "grid": [...] }.
        """
        lat_min, lat_max, lon_min, lon_max = bounding_box

        if stations:
            station = stations[0]
            clamped = max(-6, min(6, hour_from_lw - 6))
            entry = next(
                (e for e in station.tidal_stream_entries if e.hours_from_hw == clamped),
                None,
            )
            if entry is None or entry.direction_degrees is None:
                return {"source": "station", "grid": []}

            rate = (
                TidalService.interpolate_stream_rate(entry, sea)
                if sea is not None
                else (float(entry.spring_rate_knots) if entry.spring_rate_knots else None)
            )
            if rate is None:
                return {"source": "station", "grid": []}

            return _build_uniform_velocity_grid(
                lat_min, lat_max, lon_min, lon_max,
                rate * 0.514444, float(entry.direction_degrees), "station",
            )

        if sea is not None:
            result = TidalService.stream_rate_from_sea(sea, hour_from_lw)
            if result is None:
                return {"source": "manual", "grid": []}
            rate, direction = result
            return _build_uniform_velocity_grid(
                lat_min, lat_max, lon_min, lon_max,
                rate * 0.514444, direction, "manual",
            )

        return {"source": None, "grid": []}

    @staticmethod
    def tidal_gates_for_day(day: Day, points: list, sea: Optional[Sea]) -> list:
        """
        Return tidal gate warnings for route points within 5 km of a tidal station.

        Each warning: { point_id, station_name, rate_knots, direction_degrees,
                        next_slack_utc, is_blocking }.
        is_blocking is True when rate_knots > 2.0.
        """
        if not day.date or not points:
            return []

        itinerary = db.session.get(Itinerary, day.itinerary_id)
        avg_speed = itinerary.avg_speed_knots if itinerary and itinerary.avg_speed_knots else 2.5

        hw_min: Optional[int] = sea.high_tide.hour * 60 + sea.high_tide.minute if sea and sea.high_tide else None
        lw_min: Optional[int] = sea.low_tide.hour * 60 + sea.low_tide.minute if sea and sea.low_tide else None

        cumulative_nm = 0.0
        prev_lat: Optional[float] = None
        prev_lon: Optional[float] = None
        gates = []

        for point in points:
            if point.type == PointType.INTEREST:
                continue

            lat = float(point.latitude) if point.latitude is not None else None
            lon = float(point.longitude) if point.longitude is not None else None
            if lat is None or lon is None:
                continue

            if prev_lat is not None and prev_lon is not None:
                cumulative_nm += haversine_nm(prev_lat, prev_lon, lat, lon)
            prev_lat, prev_lon = lat, lon

            if point.geo is None:
                continue

            transit_min = _DEFAULT_START_MIN + int((cumulative_nm / avg_speed) * 60)
            point_ewkt = f"SRID=4326;POINT({lon} {lat})"

            nearby = (
                db.session.query(TidalStation)
                .filter(ST_DWithin(cast(TidalStation.location, Geography), point_ewkt, 5000))
                .all()
            )

            for station in nearby:
                hours_from_hw = (
                    max(-6, min(6, round((transit_min - hw_min) / 60)))
                    if hw_min is not None
                    else 0  # Conservative: assume peak rate when HW unknown
                )

                entry = next(
                    (e for e in station.tidal_stream_entries if e.hours_from_hw == hours_from_hw),
                    None,
                )
                if entry is None:
                    continue

                rate = (
                    TidalService.interpolate_stream_rate(entry, sea)
                    if sea
                    else (float(entry.spring_rate_knots) if entry.spring_rate_knots else None)
                )
                if rate is None:
                    continue

                direction = entry.direction_degrees

                next_slack_utc = None
                if sea and sea.high_tide and day.date:
                    hw_dt = datetime.combine(day.date, sea.high_tide)
                    if hours_from_hw <= 0:
                        next_slack_utc = hw_dt.isoformat() + "Z"
                    elif sea.low_tide:
                        lw_dt = datetime.combine(day.date, sea.low_tide)
                        if lw_min is not None and hw_min is not None and lw_min <= hw_min:
                            lw_dt += timedelta(days=1)
                        next_slack_utc = lw_dt.isoformat() + "Z"
                    else:
                        next_slack_utc = (hw_dt + timedelta(hours=6)).isoformat() + "Z"

                is_blocking = rate > 2.0
                gates.append({
                    "point_id": str(point.id),
                    "station_name": station.name,
                    "rate_knots": round(rate, 3),
                    "direction_degrees": direction,
                    "next_slack_utc": next_slack_utc,
                    "is_blocking": is_blocking,
                })

                logger.info(
                    "tidal_gate_detected",
                    extra={
                        "day_id": str(day.id),
                        "point_id": str(point.id),
                        "station_id": str(station.id),
                        "rate_knots": rate,
                        "is_blocking": is_blocking,
                    },
                )

        return gates
