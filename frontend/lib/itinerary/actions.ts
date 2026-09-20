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
import { ImageSchema } from "@/lib/dtos/image"
import type { Image } from "@/lib/dtos/image"
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
import { exploreQueryString } from "./explore-params"
import { extractRouteData } from "./public-routes"
import type { RouteData } from "./public-routes"
import type { BoundaryApplyPayload } from "./boundaries"

const EMPTY_EXPLORE_PAGE: ExplorePage = { items: [], total: 0, page: 1, pages: 1 }

export type ItineraryActionResult =
  { success: true; itineraryId: string } | { success: false; error: string }

export type ItineraryUpdateResult =
  { success: true; itinerary: Itinerary } | { success: false; error: string }

export type PointActionResult = { success: true; point: Point } | { success: false; error: string }

export type ImageActionResult = { success: true; image: Image } | { success: false; error: string }

export type DayActionResult = { success: true; day: Day } | { success: false; error: string }

export type DeleteActionResult = { success: true } | { success: false; error: string }

export type ApplyBoundariesResult =
  { success: true; itinerary: Itinerary } | { success: false; error: string }

export type CreateTripFromItineraryResult =
  { success: true; tripId: string } | { success: false; error: string }

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
  fields: Partial<
    Pick<Itinerary, "name" | "description" | "difficulty" | "isPublic" | "avgSpeedKnots" | "tripId">
  >,
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

// Generate/regenerate the unlisted trip-narrative share link (M7d). Regenerating
// invalidates the previous token — the backend rotates it unconditionally.
export async function generateStoryShare(id: string): Promise<ItineraryUpdateResult> {
  try {
    const raw = await apiPost<unknown>(`/api/itinerary/${id}/story-share`, {})
    const itinerary = ItinerarySchema.parse(raw)
    revalidatePath("/itinerary")
    return { success: true, itinerary }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to generate share link.",
    }
  }
}

export async function fetchItineraries(): Promise<Itinerary[]> {
  try {
    const raw = await apiGet<unknown[]>("/api/itinerary/all")
    return ItinerariesSchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

export async function createPoint(
  dayId: string,
  fields: {
    type: PointType
    latitude: number
    longitude: number
    // Splice the new point into the route directly after this one instead of
    // appending it to the tail — a point dropped on a leg.
    afterPointId?: string
  },
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

// Toggle an image's public/private visibility (M7d §8). The backend moves the
// underlying storage object between prefixes and returns the image with its
// (possibly changed) location — always use the returned image, not a guessed one.
export async function setImagePublic(
  pointId: string,
  imageId: string,
  isPublic: boolean,
): Promise<ImageActionResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/point/${pointId}/images/${imageId}`, { isPublic })
    const image = ImageSchema.parse(raw)
    return { success: true, image }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update image visibility.",
    }
  }
}

// Set or clear what a photo shows (M19 §2). Sends only `caption` — the endpoint
// applies just the fields present, so including isPublic here would let captioning
// a photo silently change whether it is published.
export async function setImageCaption(
  pointId: string,
  imageId: string,
  caption: string | null,
): Promise<ImageActionResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/point/${pointId}/images/${imageId}`, { caption })
    const image = ImageSchema.parse(raw)
    return { success: true, image }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update the caption.",
    }
  }
}

export async function uploadPointImage(
  pointId: string,
  formData: FormData,
): Promise<ImageActionResult> {
  try {
    const raw = await apiUpload<unknown>(`/api/point/${pointId}/images`, formData)
    const image = ImageSchema.parse(raw)
    return { success: true, image }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to upload photo." }
  }
}

export async function deletePointImage(
  pointId: string,
  imageId: string,
): Promise<DeleteActionResult> {
  try {
    await apiDelete(`/api/point/${pointId}/images/${imageId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete photo." }
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

/**
 * Return the itinerary's Day 0 staging area, creating it if it has none.
 *
 * Day 0 is where every newly dropped point lands before a boundary owns it, and
 * `/api/day/create` cannot make one — `day_number` is validated 1..365 because Day 0
 * is internal. Every creation path is supposed to leave one behind; this is the
 * builder's repair path for one that didn't. Idempotent.
 */
export async function ensureStagingDay(itineraryId: string): Promise<DayActionResult> {
  try {
    const raw = await apiPost<unknown>(`/api/itinerary/${itineraryId}/staging-day`, {})
    const day = DaySchema.parse(raw)
    return { success: true, day }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to prepare the itinerary for editing.",
    }
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

export type PointOrderResult = { success: true } | { success: false; error: string }

/**
 * Persist the route's order — the `next_id` chain follows the submitted ids.
 *
 * `pointOrder` is the client's canonical route order; this is the only way to
 * send it back. The submitted ids must be exactly the itinerary's points, or the
 * server answers 409 rather than orphaning the ones left out.
 */
export async function setPointOrder(
  itineraryId: string,
  order: string[],
): Promise<PointOrderResult> {
  try {
    await apiPost<unknown>(`/api/itinerary/${itineraryId}/point-order`, { order })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to save the route order.",
    }
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

export async function searchPublicItineraries(filters: ExploreFilters = {}): Promise<ExplorePage> {
  try {
    const query = exploreQueryString(filters)
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

// Unlisted trip-narrative share link (M7d) — same shape as fetchPublicItineraryDetail,
// but keyed by the itinerary's story_share_token rather than its id, and reachable
// whether or not the itinerary is also discoverable-public.
export async function fetchStoryByToken(token: string): Promise<PublicItineraryDetail | null> {
  try {
    const raw = await apiGetPublic<unknown>(`/api/itinerary/story/public/${token}`)
    return PublicItineraryDetailSchema.parse(raw)
  } catch {
    return null
  }
}
