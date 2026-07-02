"use server"

import { revalidatePath } from "next/cache"
import {
  apiGet,
  apiGetPublic,
  apiPost,
  apiPatch,
  apiDelete,
  apiUpload,
  isRedirectError,
} from "@/lib/api/client"
import { PointSchema } from "@/lib/dtos/point"
import type { PointType, Point } from "@/lib/dtos/point"
import { DaySchema } from "@/lib/dtos/day"
import type { Day } from "@/lib/dtos/day"
import {
  ItinerarySchema,
  ItinerariesSchema,
  PublicItineraryDetailSchema,
  ExplorePageSchema,
} from "@/lib/dtos/itinerary"
import type {
  Itinerary,
  PublicItineraryDetail,
  ExplorePage,
  ExploreFilters,
} from "@/lib/dtos/itinerary"
import { extractRouteData } from "./public-routes"
import type { RouteData } from "./public-routes"
import type { BoundaryApplyPayload } from "./boundaries"

const EMPTY_EXPLORE_PAGE: ExplorePage = { items: [], total: 0, page: 1, pages: 1 }

export type ItineraryActionResult =
  | { success: true; itineraryId: string }
  | { success: false; error: string }

export type ItineraryUpdateResult =
  | { success: true; itinerary: Itinerary }
  | { success: false; error: string }

export type PointActionResult = { success: true; point: Point } | { success: false; error: string }

export type DayActionResult = { success: true; day: Day } | { success: false; error: string }

export type DeleteActionResult = { success: true } | { success: false; error: string }

export type ApplyBoundariesResult =
  | { success: true; itinerary: Itinerary }
  | { success: false; error: string }

export type CreateTripFromItineraryResult =
  | { success: true; tripId: string }
  | { success: false; error: string }

export async function createItinerary(params: {
  tripId?: string | null
  name?: string
}): Promise<ItineraryActionResult> {
  try {
    const body: Record<string, unknown> = {}
    if (params.tripId) body.tripId = params.tripId
    if (params.name !== undefined) body.name = params.name
    const itinerary = await apiPost<{ id: string }>("/api/itinerary/create", body)
    if (params.tripId) revalidatePath(`/trips/${params.tripId}`)
    revalidatePath("/itinerary")
    return { success: true, itineraryId: itinerary.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create itinerary." }
  }
}

export async function updateItinerary(
  id: string,
  fields: Partial<Pick<Itinerary, "name" | "isPublic" | "avgSpeedKnots" | "tripId">>,
): Promise<ItineraryUpdateResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/itinerary/${id}`, fields)
    const itinerary = ItinerarySchema.parse(raw)
    revalidatePath("/itinerary")
    return { success: true, itinerary }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update itinerary." }
  }
}

export async function fetchItineraries(): Promise<Itinerary[]> {
  try {
    const raw = await apiGet<unknown[]>("/api/itinerary/all")
    return ItinerariesSchema.parse(raw)
  } catch {
    return []
  }
}

export async function createPoint(
  dayId: string,
  fields: { type: PointType; latitude: number; longitude: number },
): Promise<PointActionResult> {
  try {
    const raw = await apiPost<unknown>("/api/point/create", { dayId, ...fields })
    const point = PointSchema.parse(raw)
    return { success: true, point }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create point." }
  }
}

export async function updatePoint(
  id: string,
  fields: Partial<{
    type: PointType
    latitude: number
    longitude: number
    name: string | null
    notes: string | null
  }>,
): Promise<PointActionResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/point/${id}`, fields)
    const point = PointSchema.parse(raw)
    return { success: true, point }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update point." }
  }
}

export async function deletePoint(id: string): Promise<DeleteActionResult> {
  try {
    await apiDelete(`/api/point/${id}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete point." }
  }
}

export async function deleteItinerary(id: string): Promise<DeleteActionResult> {
  try {
    await apiDelete(`/api/itinerary/${id}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete itinerary." }
  }
}

export async function createDay(itineraryId: string, dayNumber: number): Promise<DayActionResult> {
  try {
    const raw = await apiPost<unknown>("/api/day/create", { itineraryId, dayNumber })
    const day = DaySchema.parse(raw)
    return { success: true, day }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create day." }
  }
}

export async function updateDay(
  id: string,
  fields: Partial<Pick<Day, "date" | "dayNumber" | "startPointId" | "endPointId">>,
): Promise<DayActionResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/day/${id}`, fields)
    const day = DaySchema.parse(raw)
    return { success: true, day }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update day." }
  }
}

export async function deleteDay(id: string): Promise<DeleteActionResult> {
  try {
    await apiDelete(`/api/day/${id}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete day." }
  }
}

export async function applyBoundaries(
  itineraryId: string,
  payload: BoundaryApplyPayload,
): Promise<ApplyBoundariesResult> {
  try {
    const raw = await apiPost<unknown>(`/api/itinerary/${itineraryId}/apply-boundaries`, payload)
    const itinerary = ItinerarySchema.parse(raw)
    return { success: true, itinerary }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to apply boundaries." }
  }
}

export async function assignPointsToDay(
  dayId: string,
  startPointId: string,
  endPointId: string,
): Promise<DeleteActionResult> {
  try {
    await apiPost<unknown>(`/api/day/${dayId}/assign`, { startPointId, endPointId })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to assign points." }
  }
}

export async function forkItinerary(id: string): Promise<ItineraryActionResult> {
  try {
    const result = await apiPost<{ itineraryId: string }>(`/api/itinerary/${id}/fork`, {})
    revalidatePath("/itinerary")
    return { success: true, itineraryId: result.itineraryId }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to fork itinerary." }
  }
}

export async function createTripFromItinerary(
  itineraryId: string,
  tripName: string,
): Promise<CreateTripFromItineraryResult> {
  try {
    const trip = await apiPost<{ id: string }>("/api/trip/create", { destination: tripName.trim() })
    await apiPatch(`/api/itinerary/${itineraryId}`, { tripId: trip.id })
    revalidatePath("/itinerary")
    revalidatePath(`/trips/${trip.id}`)
    return { success: true, tripId: trip.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create trip." }
  }
}

export async function importGpx(formData: FormData): Promise<ItineraryActionResult> {
  try {
    const result = await apiUpload<{ itineraryId: string }>("/api/itinerary/import", formData)
    revalidatePath("/itinerary")
    return { success: true, itineraryId: result.itineraryId }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to import GPX." }
  }
}

function buildExploreParams(filters: ExploreFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.name?.trim()) params.set("name", filters.name.trim())
  for (const season of filters.seasons ?? []) params.append("season", season)
  if (filters.minMiles != null) params.set("minMiles", String(filters.minMiles))
  if (filters.maxMiles != null) params.set("maxMiles", String(filters.maxMiles))
  if (filters.minDays != null) params.set("minDays", String(filters.minDays))
  if (filters.maxDays != null) params.set("maxDays", String(filters.maxDays))
  // bbox is all-or-nothing — only sent when the full viewport box is known.
  if (filters.bbox) {
    params.set("minLat", String(filters.bbox.minLat))
    params.set("minLng", String(filters.bbox.minLng))
    params.set("maxLat", String(filters.bbox.maxLat))
    params.set("maxLng", String(filters.bbox.maxLng))
  }
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.page != null) params.set("page", String(filters.page))
  if (filters.perPage != null) params.set("per_page", String(filters.perPage))
  return params
}

export async function searchPublicItineraries(filters: ExploreFilters = {}): Promise<ExplorePage> {
  try {
    const query = buildExploreParams(filters).toString()
    const raw = await apiGetPublic<unknown>(`/api/itinerary/explore${query ? `?${query}` : ""}`)
    return ExplorePageSchema.parse(raw)
  } catch {
    return EMPTY_EXPLORE_PAGE
  }
}

export async function fetchPublicItineraryDetail(
  id: string,
): Promise<PublicItineraryDetail | null> {
  try {
    const raw = await apiGetPublic<unknown>(`/api/itinerary/${id}/public`)
    return PublicItineraryDetailSchema.parse(raw)
  } catch {
    return null
  }
}

// Lazily fetch a single public route's full geometry (the polyline the explore list
// does not carry — list items only have a centroid).
export async function fetchPublicRouteData(id: string): Promise<RouteData | null> {
  const detail = await fetchPublicItineraryDetail(id)
  return detail ? extractRouteData(detail) : null
}
