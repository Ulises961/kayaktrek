import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"
import { apiCreateTrip } from "./trips"

// A point on a seeded route. Coordinates drive centroid + bbox facets; type is a
// PointType value ("stop" | "position").
export interface SeedPoint {
  latitude: number
  longitude: number
  name: string
  type: "stop" | "position"
}

export interface SeedDay {
  dayNumber: number
  date?: string
  points: SeedPoint[]
}

export interface SeededRoute {
  tripId: string
  itineraryId: string
}

// Seed a public, discoverable itinerary by creating a trip with the route embedded
// inline (the /trip/create endpoint accepts a nested itinerary). The itinerary id is
// resolved back through the public /explore listing — which also proves the route is
// actually discoverable — matching by the unique name the caller supplies.
export async function apiSeedPublicItinerary(
  request: APIRequestContext,
  accessToken: string,
  route: { name: string; totalMiles: number; days: SeedDay[]; destination?: string },
): Promise<SeededRoute> {
  const create = await request.post(`${API_URL}/api/v1/trip/create`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      destination: route.destination ?? route.name,
      inventory: {},
      itinerary: {
        name: route.name,
        isPublic: true,
        totalMiles: route.totalMiles,
        days: route.days,
      },
    },
  })
  if (!create.ok()) {
    throw new Error(`seed itinerary failed: ${create.status()} ${await create.text()}`)
  }
  const trip = await create.json()

  const itineraryId = await apiFindExploreItemIdByName(request, route.name)
  if (!itineraryId) {
    throw new Error(`seeded route "${route.name}" did not surface in /explore`)
  }
  return { tripId: trip.id as string, itineraryId }
}

// Look up a public route's id by exact name via the unauthenticated /explore listing.
export async function apiFindExploreItemIdByName(
  request: APIRequestContext,
  name: string,
): Promise<string | null> {
  const res = await request.get(
    `${API_URL}/api/v1/itinerary/explore?name=${encodeURIComponent(name)}&per_page=50`,
  )
  if (!res.ok()) throw new Error(`explore lookup failed: ${res.status()}`)
  const body = await res.json()
  const match = (body.items ?? []).find((item: { name?: string }) => item.name === name)
  return match?.id ?? null
}

export async function apiDeleteItinerary(
  request: APIRequestContext,
  accessToken: string,
  itineraryId: string,
): Promise<void> {
  await request.delete(`${API_URL}/api/v1/itinerary/${itineraryId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

// ─── M14 itinerary-builder editing fixtures ────────────────────────────────
//
// Nested trip/itinerary creation (apiCreateTrip / apiSeedPublicItinerary
// above) does NOT set Day.startPointId/endPointId or Point.next_id —
// `start_point_id`/`end_point_id` on DaySchema and `next_id` on PointSchema
// are all dump_only, so a nested `itinerary.days[].points` payload is
// silently stripped of them before it reaches the model (verified against
// Schemas/day_schema.py and Schemas/point_schema.py). Worse, it doesn't even
// create the itinerary's Day 0 staging day: `Trip(**data)` builds the whole
// object graph straight from TripSchema's nested marshmallow load
// (Services/trip_service.py create_trip), which never calls
// ItineraryService.create_itinerary — the one place Day 0 actually gets
// created (Services/itinerary_service.py). The real "New Trip" UI form
// (lib/trips/actions.ts createTrip) doesn't send a nested `itinerary` at
// all; a trip's itinerary is always created afterwards via the standalone
// POST /itinerary/create, tripId-linked (components/trips/tabs/itinerary-tab.tsx,
// components/itinerary/new-itinerary-button.tsx) — that's the path this
// fixture also uses.
//
// So this seeds the same way the app itself does end to end: create a bare
// trip with no nested itinerary, create its itinerary via POST
// /itinerary/create (this is what actually creates Day 0), create points one
// at a time against Day 0 via POST /point/create (the endpoint that chains
// `next_id` — nested creation never calls it either), create the numbered
// Day rows, then call apply-boundaries once, exactly like `handleSaveDays`
// does on a real Save. Every route this produces is one a genuine Save could
// have produced — not a synthetic shortcut the builder itself never reaches.

export interface EditablePointSpec {
  latitude: number
  longitude: number
  type: "stop" | "position"
  name?: string
}

export interface SeededEditableItinerary {
  tripId: string
  itineraryId: string
  day0Id: string
  /** Real Day ids, ordered by dayNumber (1, 2, 3, ...). */
  dayIds: string[]
  /** Point ids, in chain order — index i corresponds to `points[i]` passed in. */
  pointIds: string[]
}

export interface SeededItineraryDay {
  id: string
  dayNumber: number
  startPointId: string | null
  endPointId: string | null
  points: Array<{ id: string; [key: string]: unknown }>
}

export async function apiCreateItinerary(
  request: APIRequestContext,
  accessToken: string,
  tripId: string,
): Promise<{ id: string; days: SeededItineraryDay[] }> {
  const res = await request.post(`${API_URL}/api/v1/itinerary/create`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { tripId },
  })
  if (!res.ok()) throw new Error(`create itinerary failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiCreatePoint(
  request: APIRequestContext,
  accessToken: string,
  dayId: string,
  point: EditablePointSpec,
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await request.post(`${API_URL}/api/v1/point/create`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { dayId, ...point },
  })
  if (!res.ok()) throw new Error(`create point failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiCreateDay(
  request: APIRequestContext,
  accessToken: string,
  itineraryId: string,
  dayNumber: number,
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await request.post(`${API_URL}/api/v1/day/create`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { itineraryId, dayNumber },
  })
  if (!res.ok()) throw new Error(`create day failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiApplyBoundaries(
  request: APIRequestContext,
  accessToken: string,
  itineraryId: string,
  boundaries: Array<{
    dayId: string
    startPointId: string
    endPointId: string
    date?: string | null
  }>,
  points: Array<{ id: string; type?: string; name?: string }> = [],
): Promise<{ id: string; days: SeededItineraryDay[] }> {
  const res = await request.post(`${API_URL}/api/v1/itinerary/${itineraryId}/apply-boundaries`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { boundaries, points },
  })
  if (!res.ok()) throw new Error(`apply boundaries failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiGetItinerary(
  request: APIRequestContext,
  accessToken: string,
  itineraryId: string,
): Promise<{ id: string; days: SeededItineraryDay[] }> {
  const res = await request.get(`${API_URL}/api/v1/itinerary/${itineraryId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok()) throw new Error(`get itinerary failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

/**
 * Seed a private, already-boundaried route for the itinerary builder's Edit
 * mode. `dayEndIndices[i]` is the 0-based index into `points` of day (i+1)'s
 * end anchor (inclusive); day (i+1) starts where day i ended (or at index 0
 * for day 1) — the same shared-overnight-stop convention the builder itself
 * uses. Indices must be non-decreasing; the last entry is conventionally
 * `points.length - 1` (nothing enforces that, but every caller in this suite
 * follows it, matching the builder's own "last day always reaches the tail"
 * rule).
 */
export async function apiSeedEditableItinerary(
  request: APIRequestContext,
  accessToken: string,
  opts: {
    destination: string
    points: EditablePointSpec[]
    dayEndIndices: number[]
    dates?: (string | null)[]
  },
): Promise<SeededEditableItinerary> {
  // itinerary: undefined (not omitted) so it overrides apiCreateTrip's own
  // default nested-itinerary payload — JSON.stringify drops the undefined
  // key, so the request carries no `itinerary` field at all, same as the
  // real "New Trip" form. See the module-level comment above for why that
  // matters here (nested creation never produces a Day 0).
  const trip = await apiCreateTrip(request, accessToken, {
    destination: opts.destination,
    itinerary: undefined,
  })
  const tripId = trip.id as string

  const itinerary = await apiCreateItinerary(request, accessToken, tripId)
  const itineraryId = itinerary.id
  const day0 = itinerary.days.find((d) => d.dayNumber === 0)
  if (!day0) throw new Error("newly created itinerary is missing its Day 0 staging day")
  const day0Id = day0.id

  const pointIds: string[] = []
  for (const point of opts.points) {
    const created = await apiCreatePoint(request, accessToken, day0Id, point)
    pointIds.push(created.id as string)
  }

  const dayIds: string[] = []
  for (let i = 0; i < opts.dayEndIndices.length; i++) {
    const day = await apiCreateDay(request, accessToken, itineraryId, i + 1)
    dayIds.push(day.id as string)
  }

  const boundaries = opts.dayEndIndices.map((endIdx, i) => ({
    dayId: dayIds[i],
    startPointId: i === 0 ? pointIds[0] : pointIds[opts.dayEndIndices[i - 1]],
    endPointId: pointIds[endIdx],
    date: opts.dates?.[i] ?? null,
  }))

  await apiApplyBoundaries(request, accessToken, itineraryId, boundaries)

  return { tripId, itineraryId, day0Id, dayIds, pointIds }
}
