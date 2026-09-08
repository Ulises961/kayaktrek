"use server"

import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { WindDiamondSchema, type WindDiamond, type WindDiamondForm } from "@/lib/dtos/wind-diamond"
import { z } from "zod"

export type WindDiamondsResult =
  { success: true; data: WindDiamond[] } | { success: false; error: string }

export type WindDiamondMutationResult =
  { success: true; data: WindDiamond } | { success: false; error: string }

export type WindDiamondDeleteResult = { success: true } | { success: false; error: string }

export async function fetchWindDiamonds(itineraryId: string): Promise<WindDiamondsResult> {
  try {
    const raw = await apiGet<unknown>(`/api/wind-diamond/by-itinerary/${itineraryId}`)
    const data = z.array(WindDiamondSchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch wind diamonds.",
    }
  }
}

export async function createWindDiamond(
  itineraryId: string,
  lat: number,
  lng: number,
  fields: WindDiamondForm,
): Promise<WindDiamondMutationResult> {
  try {
    const raw = await apiPost<unknown>(`/api/wind-diamond/create`, {
      itineraryId,
      location: { type: "Point", coordinates: [lng, lat] },
      name: fields.name ?? null,
      notes: fields.notes ?? null,
    })
    return { success: true, data: WindDiamondSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create wind diamond.",
    }
  }
}

export async function updateWindDiamond(
  windDiamondId: string,
  fields: WindDiamondForm,
): Promise<WindDiamondMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/wind-diamond/${windDiamondId}`, {
      name: fields.name ?? null,
      notes: fields.notes ?? null,
    })
    return { success: true, data: WindDiamondSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update wind diamond.",
    }
  }
}

export async function repositionWindDiamond(
  windDiamondId: string,
  lat: number,
  lng: number,
): Promise<WindDiamondMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/wind-diamond/${windDiamondId}`, {
      location: { type: "Point", coordinates: [lng, lat] },
    })
    return { success: true, data: WindDiamondSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to move wind diamond.",
    }
  }
}

export async function deleteWindDiamond(windDiamondId: string): Promise<WindDiamondDeleteResult> {
  try {
    await apiDelete(`/api/wind-diamond/${windDiamondId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete wind diamond.",
    }
  }
}
