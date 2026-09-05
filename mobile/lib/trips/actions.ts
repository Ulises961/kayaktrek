import { z } from "zod"
import { TripSchema, type Trip } from "../../../frontend/lib/dtos/trip"
import { LogisticsSchema, type Logistics } from "../../../frontend/lib/dtos/logistics"

import { apiGet } from "../api/client"
import { getSession } from "../auth/session"

const TripsPageSchema = z.object({
  items: z.array(TripSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})
export type TripsPage = z.infer<typeof TripsPageSchema>

// GET /api/v1/trip/<user_id>/all (backend/Resources/trip_resource.py) — paginated;
// WP2 only needs page 1 at the default page size, matching M9b's "validate the stack"
// scope rather than building pagination UI for a read-only proof.
export async function getTrips(): Promise<TripsPage> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const raw = await apiGet<unknown>(`/api/trip/${session.userId}/all`)
  return TripsPageSchema.parse(raw)
}

// GET /api/v1/trip/<id> — full trip including the nested itinerary (days -> points)
// and travellers (vessel + emergency-contact fields already on TripMemberSchema), per
// backend/Resources/trip_resource.py's TripSchema dump. WP3's map, WP5's weather/sea
// (Day.weather/Day.sea), and WP6's crew manifest all come from this one fetch — only
// the shore contact (Logistics, not part of Trip) needs a separate call, below.
export async function getTrip(id: string): Promise<Trip> {
  const raw = await apiGet<unknown>(`/api/trip/${id}`)
  return TripSchema.parse(raw)
}

// GET /api/v1/logistics/<tripId> — shore contact for the float plan (WP6). Returns
// `{}` when the trip has no logistics yet (backend/Resources/logistics_resource.py),
// which LogisticsSchema parses fine since every field is nullish/optional.
export async function getLogistics(tripId: string): Promise<Logistics> {
  const raw = await apiGet<unknown>(`/api/logistics/${tripId}`)
  return LogisticsSchema.parse(raw)
}
