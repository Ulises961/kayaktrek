import { API_PREFIX, API_URL } from "../api/config"

// Mirrors frontend/lib/map/tiles.ts — same M8 tile proxy, same URL template. No new
// backend surface for mobile (the M9b plan WP3).
export const OSM_TILE_URL = `${API_URL}${API_PREFIX}/tiles/osm/{z}/{x}/{y}.png`

// A minimal inline style — one raster source pointing at the M8 tile proxy, one layer
// to render it — rather than a hosted style.json (the M9b plan WP3: "no new backend
// work needed", and we don't have a style-hosting concern to solve here either).
export const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: [OSM_TILE_URL],
      tileSize: 256,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
}
