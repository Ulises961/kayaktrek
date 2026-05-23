"use server"

import { revalidatePath } from "next/cache"
import { apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { PointSchema } from "@/lib/dtos/point"
import type { PointType, Point } from "@/lib/dtos/point"

export type ItineraryActionResult =
  | { success: true; itineraryId: string }
  | { success: false; error: string }

export type PointActionResult =
  | { success: true; point: Point }
  | { success: false; error: string }

export type DeleteActionResult =
  | { success: true }
  | { success: false; error: string }

export async function createItinerary(tripId: string): Promise<ItineraryActionResult> {
  try {
    const itinerary = await apiPost<{ id: string }>("/api/itinerary/create", { tripId })
    revalidatePath(`/trips/${tripId}`)
    return { success: true, itineraryId: itinerary.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create itinerary." }
  }
}

export async function createPoint(
  dayId: string,
  fields: { type: PointType; latitude: number; longitude: number }
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
  fields: Partial<{ type: PointType; latitude: number; longitude: number }>
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
