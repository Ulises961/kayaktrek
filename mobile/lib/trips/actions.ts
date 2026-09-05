import { z } from "zod"
import { TripSchema, type Trip } from "../../../frontend/lib/dtos/trip"

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

// GET /api/v1/trip/<id> — full trip including the nested itinerary (days -> points),
// per backend/Resources/trip_resource.py's TripSchema dump. WP3's map screen and WP5/WP6's
// weather/float-plan reads all come from this one fetch, not a separate itinerary call.
export async function getTrip(id: string): Promise<Trip> {
  const raw = await apiGet<unknown>(`/api/trip/${id}`)
  return TripSchema.parse(raw)
}
