import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

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
