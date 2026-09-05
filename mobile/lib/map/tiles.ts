import { API_PREFIX, API_URL } from "../api/config"

// Mirrors frontend/lib/map/tiles.ts — same M8 tile proxy, same URL template. No new
// backend surface for mobile (plans/M9b.md WP3).
export const OSM_TILE_URL = `${API_URL}${API_PREFIX}/tiles/osm/{z}/{x}/{y}.png`
