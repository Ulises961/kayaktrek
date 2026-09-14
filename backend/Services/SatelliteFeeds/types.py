from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class SatelliteProvider(str, Enum):
    """Value stored in SatelliteFeed.provider and echoed as PositionPing.source —
    matches the string M8's ingest pipeline already expects in `source`."""

    INREACH_MAPSHARE = "inreach_mapshare"
    SPOT = "spot"
    ZOLEO = "zoleo"
    BIVY_STICK = "bivy_stick"


@dataclass(frozen=True)
class NormalizedPosition:
    """The one shape every provider parser must produce. `raw` is optional and kept
    only for debugging/audit, never persisted verbatim onto PositionPing."""

    lat: float
    lng: float
    timestamp: datetime  # tz-aware, UTC
    source: SatelliteProvider
    raw: Optional[dict[str, Any]] = None  # the provider's own per-point payload, pre-normalization
