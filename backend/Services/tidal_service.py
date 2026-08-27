import logging
import math
from datetime import datetime, time, timedelta
from typing import Optional

import numpy as np

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from geoalchemy2.shape import to_shape
from sqlalchemy import cast

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.sea import Sea
from Models.tidal_station import TidalStation
from Models.tidal_stream_entry import TidalStreamEntry
from Services.Utils import land_mask
from Services.Utils.geo_utils import haversine_nm

logger = logging.getLogger(__name__)

# Cumulative fractions at each hour from LW: 0, 1/12, 3/12, 6/12, 9/12, 11/12, 12/12
_RULE_12_FRACTIONS = [0.0, 1 / 12, 3 / 12, 6 / 12, 9 / 12, 11 / 12, 1.0]

# Rule-of-thirds rate fractions at the hour MARKS across one 6-hour half-cycle,
# indexed by hours from the slack at its start: slack→1/3→2/3→peak→2/3→1/3 (and
# 0 again at the next slack, which is index 0 of the following half). The stream
# is slack at HW and LW and peaks at mid-tide; max_spring_rate_knots is the peak.
# (The classic "1/3, 2/3, 3/3, 3/3, 2/3, 1/3" phrasing gives *hourly-average*
# rates over the six intervals — sampled onto the 13 hour marks it would put a
# non-zero rate at slack and a double peak, which is wrong for a diamond table.)
_STREAM_FRACTIONS = [0.0, 1 / 3, 2 / 3, 1.0, 2 / 3, 1 / 3]

# Assumed paddling start (minutes from midnight) when no explicit start time exists
_DEFAULT_START_MIN = 9 * 60  # 09:00

# Resolution (per axis) of the uniform velocity grid. The field is a single
# stamped value, so densifying it is information-neutral (every cell keeps the
# same u/v) but is required for a smooth forecast-cell disc edge and a
# reasonable land coastline when masking (M5b). Tuned to the landing cell.
_VELOCITY_GRID_RESOLUTION = 24


def _build_uniform_velocity_grid(
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
    rate_ms: float,
    direction_deg: float,
    source: str,
    mask_land: bool = False,
) -> dict:
    """
    Build a uniform leaflet-velocity grid from speed (m/s) + direction.

    The grid stamps one (u, v) across an ``N×N`` grid (``N`` =
    ``_VELOCITY_GRID_RESOLUTION``); it is not a spatial forecast. When
    ``mask_land`` is set (marine fields only), cells whose centre falls on land
    are nulled so no particles render over land — waves do not exist on land.
    leaflet-velocity skips null cells.
    """
    rad = math.radians(direction_deg)
    u = round(rate_ms * math.sin(rad), 5)
    v = round(rate_ms * math.cos(rad), 5)

    nx = ny = _VELOCITY_GRID_RESOLUTION
    n = nx * ny
    dx = round((lon_max - lon_min) / (nx - 1), 4) if nx > 1 else 0.0
    dy = round((lat_max - lat_min) / (ny - 1), 4) if ny > 1 else 0.0

    eastward: list[Optional[float]] = [u] * n
    northward: list[Optional[float]] = [v] * n

    if mask_land:
        # Row-major from the NW corner (la1/north, lo1/west) — matches how
        # leaflet-velocity maps a flat cell index back to lat/lon.
        cell_lats = lat_max - np.arange(ny) * dy
        cell_lons = lon_min + np.arange(nx) * dx
        lat_grid, lon_grid = np.meshgrid(cell_lats, cell_lons, indexing="ij")
        is_land = land_mask.is_land(lat_grid, lon_grid).ravel()
        for index in np.flatnonzero(is_land):
            eastward[index] = None
            northward[index] = None

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
                "data": eastward,
            },
            {
                "header": {**header_base, "parameterCategory": 2, "parameterNumber": 3, "parameterNumberName": "northward_component"},
                "data": northward,
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
    def synthesise_stream_entries(
        max_spring_rate_knots: float,
        flood_direction_degrees: float,
        ebb_direction_degrees: float,
        max_neap_rate_knots: Optional[float] = None,
    ) -> list:
        """
        Build the 13 hourly TidalStreamEntry rows (hours_from_hw -6..+6) for a
        simple-mode diamond using the rule of thirds.

        Slack (zero rate) is assumed at HW and LW; the peak rate is reached at
        mid-flood and mid-ebb (±3 h from HW). Each hour mark is a third-fraction
        of the peak — 0 → 1/3 → 2/3 → peak → 2/3 → 1/3 → 0 across each 6-hour
        half-cycle. The flood half (LW→HW) takes the flood direction, the ebb
        half (HW→LW) the ebb.

        When max_neap_rate_knots is omitted the neap rate mirrors the spring rate
        (no spring/neap swing), so the entered peak is rendered as-is regardless
        of the day's range.

        Returns detached TidalStreamEntry rows (no station_id) — the caller
        attaches them via the station relationship so the cascade stamps the FK.
        """
        neap_peak = max_neap_rate_knots if max_neap_rate_knots is not None else max_spring_rate_knots
        entries = []
        for hours_from_hw in range(-6, 7):
            # LW sits 6 h before HW, so hour-from-LW = hour-from-HW + 6 (mod 12).
            # Within each 6-hour half (flood 0..5, ebb 6..11) the position from
            # that half's opening slack indexes the rule-of-thirds fractions.
            hour_from_lw = (hours_from_hw + 6) % 12
            fraction = _STREAM_FRACTIONS[hour_from_lw % 6]
            is_flood = hour_from_lw < 6
            entries.append(
                TidalStreamEntry(
                    hours_from_hw=hours_from_hw,
                    direction_degrees=(flood_direction_degrees if is_flood else ebb_direction_degrees),
                    spring_rate_knots=round(fraction * max_spring_rate_knots, 3),
                    neap_rate_knots=round(fraction * neap_peak, 3),
                )
            )
        return entries

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
            mask_land=True,
        )

    @staticmethod
    def _entry_rate(entry: TidalStreamEntry, sea: Optional[Sea]) -> Optional[float]:
        """
        Rate (knots) for one stream entry, interpolated for the day's range when a
        Sea record is available, else the raw spring rate. Rounded to 3 dp.
        """
        rate = (
            TidalService.interpolate_stream_rate(entry, sea)
            if sea is not None
            else (float(entry.spring_rate_knots) if entry.spring_rate_knots is not None else None)
        )
        return round(rate, 3) if rate is not None else None

    @staticmethod
    def _hours_from_hw_at(minutes_from_midnight: int, hw_min: Optional[int]) -> int:
        """
        Clamp an offset from HW into the diamond table's -6..+6 range.

        Falls back to 0 (HW slack) when HW is unknown — the same conservative
        assumption `tidal_gates_for_day` makes.
        """
        if hw_min is None:
            return 0
        return max(-6, min(6, round((minutes_from_midnight - hw_min) / 60)))

    @staticmethod
    def _diamonds_for_day(day: Day) -> list:
        """
        The tidal stations relevant to a day: the itinerary's user-created
        diamonds plus any globally seeded atlas stations within 50 km of the
        route centre. The two sets are disjoint (user diamonds carry an
        itinerary_id, atlas stations do not), so no de-duplication is needed.
        """
        user_diamonds = (
            db.session.query(TidalStation)
            .filter(TidalStation.itinerary_id == day.itinerary_id)
            .all()
        )

        lats = [float(p.latitude) for p in (day.points or []) if p.latitude is not None]
        lons = [float(p.longitude) for p in (day.points or []) if p.longitude is not None]
        if not lats or not lons:
            return user_diamonds

        centre_ewkt = f"SRID=4326;POINT({sum(lons) / len(lons)} {sum(lats) / len(lats)})"
        nearby_atlas = (
            db.session.query(TidalStation)
            .filter(
                TidalStation.itinerary_id.is_(None),
                ST_DWithin(cast(TidalStation.location, Geography), centre_ewkt, 50000),
            )
            .all()
        )
        return user_diamonds + nearby_atlas

    @staticmethod
    def day_diamonds(day: Day, sea: Optional[Sea], hour: int) -> list:
        """
        Resolve every tidal diamond relevant to a day at the given clock hour.

        Each diamond reports its rate/direction for the hour — the day's HW time
        (from the Sea record) maps the clock hour onto the station's hourly table
        — plus the full hour-by-hour table for the popup. Spring↔neap is
        interpolated by the day's range via `interpolate_stream_rate`.

        Returns a list of snake_case dicts; `TidalDiamondSchema` serialises them.
        """
        hw_min = sea.high_tide.hour * 60 + sea.high_tide.minute if sea and sea.high_tide else None
        hours_from_hw = TidalService._hours_from_hw_at(hour * 60, hw_min)

        diamonds = []
        for station in TidalService._diamonds_for_day(day):
            if station.location is None:
                continue
            shape = to_shape(station.location)

            entries = sorted(station.tidal_stream_entries, key=lambda e: e.hours_from_hw)
            resolved = next((e for e in entries if e.hours_from_hw == hours_from_hw), None)

            diamonds.append({
                "id": str(station.id),
                "name": station.name,
                "lat": shape.y,
                "lng": shape.x,
                "rate_knots": TidalService._entry_rate(resolved, sea) if resolved else None,
                "direction_degrees": (
                    float(resolved.direction_degrees)
                    if resolved and resolved.direction_degrees is not None
                    else None
                ),
                "source": station.source,
                "radius_m": float(station.radius_m) if station.radius_m is not None else None,
                "is_user_created": station.is_user_created,
                "hourly_table": [
                    {
                        "hour_from_hw": e.hours_from_hw,
                        "rate_knots": TidalService._entry_rate(e, sea),
                        "direction_degrees": (
                            float(e.direction_degrees) if e.direction_degrees is not None else None
                        ),
                    }
                    for e in entries
                ],
            })
        return diamonds

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
