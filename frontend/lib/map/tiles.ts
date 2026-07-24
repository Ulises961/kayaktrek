import { API_PREFIX, API_URL } from "@/lib/api/config"

// All tile fetches route through the backend proxy (M8 §D10, docs/adr/itinerary-frontend.md)
// instead of hitting OpenStreetMap/OpenSeaMap directly: MinIO-cached with a 7-day refresh,
// so repeat views don't re-hammer the upstream tile servers. No {s} subdomain — the proxy is
// a single origin, not a CDN needing browser connection-limit sharding.
export const OSM_TILE_URL = `${API_URL}${API_PREFIX}/tiles/osm/{z}/{x}/{y}.png`
export const SEAMARK_TILE_URL = `${API_URL}${API_PREFIX}/tiles/seamark/{z}/{x}/{y}.png`

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const SEAMARK_ATTRIBUTION =
  '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a> contributors'
