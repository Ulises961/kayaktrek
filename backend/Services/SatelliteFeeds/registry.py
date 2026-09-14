from Services.SatelliteFeeds.base import SatelliteFeedSource
from Services.SatelliteFeeds.providers.inreach_mapshare import InReachMapShareSource
from Services.SatelliteFeeds.types import SatelliteProvider

# Same registry-dict shape as tile_service.py's _LAYER_UPSTREAM — a plain module-level
# dict, no factory class, no dependency injection framework. Adding a provider is
# adding one dict entry once its SatelliteFeedSource subclass exists.
_SOURCES: dict[SatelliteProvider, SatelliteFeedSource] = {
    SatelliteProvider.INREACH_MAPSHARE: InReachMapShareSource(),
}


def get_source(provider: SatelliteProvider) -> SatelliteFeedSource:
    try:
        return _SOURCES[provider]
    except KeyError:
        raise ValueError("unsupported_provider")
