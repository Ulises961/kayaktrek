import "server-only"
import { cache } from "react"
import { apiGet } from "@/lib/api/client"
import { TripSchema, type Trip } from "@/lib/dtos/trip"

// The single fetcher for a trip's core record. Wrapped in React `cache()` so the
// trips/[id] layout and its active route segment share ONE upstream `/api/trip/:id`
// call per request instead of each issuing its own (M12 §R route-segment refactor —
// mirrors the existing `getMe()` precedent, lib/user/me.ts).
export const getTripCore = cache(async (tripId: string): Promise<Trip | null> => {
  try {
    const raw = await apiGet<unknown>(`/api/trip/${tripId}`)
    return TripSchema.parse(raw)
  } catch {
    return null
  }
})
