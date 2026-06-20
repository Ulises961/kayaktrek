"use server"

import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import {
  PlaceSchema,
  PlaceCategorySchema,
  type Place,
  type PlaceCategory,
  type PlaceForm,
  type PlaceWithOwnership,
} from "@/lib/dtos/place"
import { z } from "zod"

export type PlaceCategoriesResult =
  | { success: true; data: PlaceCategory[] }
  | { success: false; error: string }

export type PlacesResult =
  | { success: true; data: PlaceWithOwnership[] }
  | { success: false; error: string }

export type PlaceMutationResult = { success: true; data: Place } | { success: false; error: string }

export type PlaceDeleteResult = { success: true } | { success: false; error: string }

export async function fetchPlaceCategories(): Promise<PlaceCategoriesResult> {
  try {
    const raw = await apiGet<unknown>(`/api/place-categories`)
    const data = z.array(PlaceCategorySchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch place categories.",
    }
  }
}

export async function fetchPlaces(itineraryId: string): Promise<PlacesResult> {
  try {
    const [raw, session] = await Promise.all([
      apiGet<unknown>(`/api/place/by-itinerary/${itineraryId}`),
      getSession(),
    ])
    const places = z.array(PlaceSchema).parse(raw)
    // `mine` drives the creator-only edit/delete controls. The backend gates the
    // mutations regardless; this only decides whether to show the affordance.
    const data: PlaceWithOwnership[] = places.map((p) => ({
      ...p,
      mine: session != null && p.createdByUserId === session.userId,
    }))
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch places." }
  }
}

export async function createPlace(
  itineraryId: string,
  lat: number,
  lng: number,
  fields: PlaceForm,
): Promise<PlaceMutationResult> {
  try {
    const raw = await apiPost<unknown>(`/api/place/create`, {
      itineraryId,
      location: { type: "Point", coordinates: [lng, lat] },
      categoryId: fields.categoryId,
      label: fields.label,
      note: fields.note ?? null,
    })
    return { success: true, data: PlaceSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create place." }
  }
}

export async function updatePlace(
  placeId: string,
  fields: PlaceForm,
): Promise<PlaceMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/place/${placeId}`, {
      categoryId: fields.categoryId,
      label: fields.label,
      note: fields.note ?? null,
    })
    return { success: true, data: PlaceSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update place." }
  }
}

export async function repositionPlace(
  placeId: string,
  lat: number,
  lng: number,
): Promise<PlaceMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/place/${placeId}`, {
      location: { type: "Point", coordinates: [lng, lat] },
    })
    return { success: true, data: PlaceSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to move place." }
  }
}

export async function deletePlace(placeId: string): Promise<PlaceDeleteResult> {
  try {
    await apiDelete(`/api/place/${placeId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete place." }
  }
}
