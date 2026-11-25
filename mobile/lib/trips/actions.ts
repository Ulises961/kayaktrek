import { z } from "zod"
import { TRIP_STATE, TripFieldsSchema, TripSchema, type Trip, type TripFields } from "@shared/dtos/trip"
import { LogisticsSchema, type Logistics } from "@shared/dtos/logistics"

import { apiDelete, apiGet, apiPost } from "../api/client"
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

// POST /api/v1/trip/create (backend/Resources/trip_resource.py) — network-only, like web's
// createTrip. The caller becomes the trip's leader and the backend creates its empty
// itinerary, so the itinerary editor (M42) works on the new trip straight away.
// `TripFieldsSchema` is web's own form schema (lengths, no HTML tags, ISO dates, end on or
// after start), so a bad field fails here with web's message rather than as a server 400.
export async function createTrip(fields: TripFields): Promise<string> {
  const body = TripFieldsSchema.parse(fields)
  const created = await apiPost<{ id: string }>("/api/trip/create", body)
  return created.id
}

// POST /api/v1/trip/<id>/state — the leader's forward-only transition, online-only on
// purpose (docs/adr/mobile-offline.md: the ADR keeps the state change itself off the offline
// queue, and starting is the moment the missed-checkpoint alert arms, so the server must
// have actually heard it). The server's own reason for a refusal travels in the message.
export async function startTrip(tripId: string): Promise<void> {
  await apiPost(`/api/trip/${tripId}/state`, { state: TRIP_STATE.HAPPENING })
}

// GET /api/v1/logistics/<tripId> — shore contact for the float plan (WP6). Returns
// `{}` when the trip has no logistics yet (backend/Resources/logistics_resource.py),
// which LogisticsSchema parses fine since every field is nullish/optional.
export async function getLogistics(tripId: string): Promise<Logistics> {
  const raw = await apiGet<unknown>(`/api/logistics/${tripId}`)
  return LogisticsSchema.parse(raw)
}

// Crew mutations (M30 WP2) — mirror frontend/lib/trips/actions.ts's inviteBuddy,
// cancelInvitation, removeMember. Throw on failure rather than the web action's
// {success, error} shape: mobile mutations follow lib/connections/actions.ts's
// convention of letting the call site's own try/catch surface the message.
export async function inviteBuddy(tripId: string, userId: string): Promise<void> {
  await apiPost(`/api/trip/${tripId}/invite`, { userId })
}

export async function cancelInvitation(tripId: string, inviteeId: string): Promise<void> {
  await apiDelete(`/api/trip/${tripId}/invite/${inviteeId}`)
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  await apiDelete(`/api/trip/${tripId}/member/${userId}`)
}

// POST /api/v1/day/<id>/weather/refresh (backend/Resources/sea_resource.py) — device-
// initiated forecast refresh (M9c WP5, docs/mobile/sync-protocol-spec.md §6.4). Queues a
// Celery task; it carries no completion signal, so the caller re-pulls after a short
// settle delay rather than awaiting this call's own resolution. Gated by
// PremiumEntitlementService, a closed-by-default self-hosted stub — a 403 here is
// expected, not exceptional, and its message ("Weather refresh requires a premium plan")
// is meant to be shown to the user as-is, same as the 429 cooldown message.
export async function refreshDayWeather(dayId: string): Promise<void> {
  await apiPost(`/api/day/${dayId}/weather/refresh`, {})
}
