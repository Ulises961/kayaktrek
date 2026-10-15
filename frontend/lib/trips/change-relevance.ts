import type { TripChange } from "@/lib/dtos/trip-change"

// Which of a trip's tables each page shows (M36). A crew member's change feed carries every
// change on the trip, and re-rendering a page for a change it cannot display is the dominant
// cost of the feature: a leader dragging points would otherwise refresh everyone's crew, items
// and logistics pages with every drag. Names are the backend's wire names (`TripChange.t`).
//
// Deliberately lopsided toward refreshing: a page with no list here, an unknown extent, and a
// table nobody has listed all refresh. A stale page is a bug; an extra render is a cost.

// Every trip page's header is built from the trip itself and its members.
const TRIP_WIDE = ["trip", "trip_member"]

const CREW = [...TRIP_WIDE, "invitation"]
const ITEMS = [
  ...TRIP_WIDE,
  "inventory",
  "trip_requirement",
  "requirement_contribution",
  "personal_packing_item",
]
const LOGISTICS = [
  ...TRIP_WIDE,
  "logistics",
  "shuttle_vehicle",
  "shuttle_passenger",
  "travel_document",
]
const ROUTE_BUILDER = [
  ...TRIP_WIDE,
  "itinerary",
  "day",
  "point",
  "image",
  "place",
  "wind_diamond",
  "tidal_station",
]

const KNOWN_TABLES = new Set([...CREW, ...ITEMS, ...LOGISTICS, ...ROUTE_BUILDER])

const PAGES: { path: RegExp; tables: ReadonlySet<string> }[] = [
  { path: /^\/trips\/[^/]+\/crew\/?$/, tables: new Set(CREW) },
  { path: /^\/trips\/[^/]+\/items\/?$/, tables: new Set(ITEMS) },
  { path: /^\/trips\/[^/]+\/logistics\/?$/, tables: new Set(LOGISTICS) },
  { path: /^\/itinerary\/[^/]+\/?$/, tables: new Set(ROUTE_BUILDER) },
]

// Whether a batch of changes could alter what `pathname` shows. An empty batch is a change
// of unknown extent: it affects everything.
export function changesAffectPage(pathname: string, changes: readonly TripChange[]): boolean {
  if (changes.length === 0) return true
  const page = PAGES.find(({ path }) => path.test(pathname))
  if (!page) return true
  return changes.some((change) => !KNOWN_TABLES.has(change.t) || page.tables.has(change.t))
}
