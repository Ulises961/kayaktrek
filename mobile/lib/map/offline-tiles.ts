import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native"
import { File, Paths } from "expo-file-system"
import { Dimensions } from "react-native"

import type { Bounds } from "./bounds"
import { MAP_STYLE, OSM_TILE_URL } from "./tiles"

// M9g, free tier (plans/M26.md, "Zoom split"): every synced trip keeps the map
// tiles for the view its itinerary opens at, so the map under the route still
// renders at sea. Deeper zoom is a later, premium download, not this one.
//
// A MapLibre offline pack stores tiles by their URL, and the map asks for
// exactly those URLs whether it is online or not — so the itinerary screen
// keeps its inline style and simply finds the tiles already on the device.

// Marks the packs this module owns, so pruning never touches a pack something
// else created (a future premium download, say).
export const TILE_PACK_KIND = "trip-default-zoom"

// Zooming out from the opening view should still show a map, so a few levels
// above it come along. Each level up covers the same box with a quarter of the
// tiles, so these cost next to nothing.
const ZOOM_LEVELS_BELOW = 4

// Past this, a single-point route would ask for street-level tiles.
const MAX_PACK_ZOOM = 16

// A tenth of the route's span on every side, so the route's edges are not
// the edge of the map.
const BOUNDS_MARGIN = 0.1

// MapLibre's zoom levels are defined on a 512px world, whatever the source's
// tile size.
const WORLD_SIZE_AT_ZOOM_0 = 512

const STYLE_FILE_NAME = "offline-map-style.json"

type Viewport = { width: number; height: number }

export type TilePackRegion = {
  bounds: Bounds
  minZoom: number
  maxZoom: number
}

function mercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
}

/** The zoom at which the box just fits the viewport — what the itinerary's camera opens at. */
export function fitZoom([west, south, east, north]: Bounds, viewport: Viewport): number {
  const widthFraction = (east - west) / 360
  const heightFraction = mercatorY(south) - mercatorY(north)
  const zoomForWidth = Math.log2(viewport.width / (WORLD_SIZE_AT_ZOOM_0 * widthFraction))
  const zoomForHeight = Math.log2(viewport.height / (WORLD_SIZE_AT_ZOOM_0 * heightFraction))
  return Math.min(zoomForWidth, zoomForHeight)
}

export function tilePackRegion(route: Bounds, viewport: Viewport): TilePackRegion {
  const [west, south, east, north] = route
  const marginX = (east - west) * BOUNDS_MARGIN
  const marginY = (north - south) * BOUNDS_MARGIN
  const maxZoom = Math.max(0, Math.min(MAX_PACK_ZOOM, Math.ceil(fitZoom(route, viewport))))
  return {
    bounds: [
      Math.max(-180, west - marginX),
      Math.max(-85, south - marginY),
      Math.min(180, east + marginX),
      Math.min(85, north + marginY),
    ],
    minZoom: Math.max(0, maxZoom - ZOOM_LEVELS_BELOW),
    maxZoom,
  }
}

// Identifies what a pack holds. A route edited since, or a change of tile
// server, gives a different key and the old pack is replaced.
function regionKey(region: TilePackRegion): string {
  const box = region.bounds.map((value) => value.toFixed(4)).join(",")
  return `${OSM_TILE_URL}|${region.minZoom}-${region.maxZoom}|${box}`
}

// A pack is created from a style URL, not a style object, so the map's inline
// style is written to a file once and the pack reads it from there.
function styleFileUri(): string {
  const file = new File(Paths.document, STYLE_FILE_NAME)
  const style = JSON.stringify(MAP_STYLE)
  if (!file.exists || file.textSync() !== style) file.write(style)
  return file.uri
}

async function tripPacks(): Promise<OfflinePack[]> {
  const packs = await OfflineManager.getPacks()
  return packs.filter((pack) => pack.metadata?.kind === TILE_PACK_KIND)
}

function reportPackError(tripId: string, message: string): void {
  if (!__DEV__) return
  console.warn(`[tiles] trip ${tripId} download failed:`, message)
}

/**
 * Make sure the trip's opening map view is downloaded. Starts or resumes the
 * download and returns without waiting for it: MapLibre carries on natively,
 * and a trip that has already got its tiles costs one lookup.
 *
 * `route` is null for a trip with no located points, which has no map view to
 * keep, so any pack it had is dropped.
 */
export async function ensureTripTiles(
  tripId: string,
  route: Bounds | null,
  viewport: Viewport = Dimensions.get("window"),
): Promise<void> {
  const existing = (await tripPacks()).filter((pack) => pack.metadata?.tripId === tripId)
  const region = route ? tilePackRegion(route, viewport) : null
  const key = region ? regionKey(region) : null
  const current = existing.find((pack) => pack.metadata?.region === key)

  for (const pack of existing) {
    if (pack !== current) await OfflineManager.deletePack(pack.id)
  }
  if (!region) return

  if (current) {
    const status = await current.status()
    // Interrupted by losing signal or the app closing: pick up where it stopped.
    if (status.state === "inactive" && status.percentage < 100) await current.resume()
    return
  }

  await OfflineManager.createPack(
    {
      mapStyle: styleFileUri(),
      bounds: region.bounds,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
      metadata: { kind: TILE_PACK_KIND, tripId, region: key },
    },
    () => undefined,
    (_pack, error) => reportPackError(tripId, error.message),
  )
}

/** Drop the maps of trips no longer synced (past, archived, or gone from the list). */
export async function pruneTripTiles(keepTripIds: Set<string>): Promise<void> {
  for (const pack of await tripPacks()) {
    const tripId = pack.metadata?.tripId
    if (typeof tripId !== "string" || !keepTripIds.has(tripId)) {
      await OfflineManager.deletePack(pack.id)
    }
  }
}
