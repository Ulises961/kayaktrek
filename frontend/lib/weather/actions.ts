"use server"

import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { SeaSchema } from "@/lib/dtos/sea"
import type { Sea } from "@/lib/dtos/sea"
import { WeatherSchema } from "@/lib/dtos/weather"
import type { Weather } from "@/lib/dtos/weather"
import {
  TidalGateWarningSchema,
  TidalDiamondSchema,
  TidalStationSchema,
  TidalDiamondEditSchema,
} from "@/lib/dtos/tidal-station"
import type {
  TidalGateWarning,
  TidalDiamond,
  TidalStation,
  TidalDiamondForm,
  TidalDiamondEdit,
} from "@/lib/dtos/tidal-station"
import type { VelocityGridData } from "@/lib/types/ui"
import { z } from "zod"

export type SeaActionResult = { success: true; data: Sea } | { success: false; error: string }

export type WeatherActionResult =
  { success: true; data: Weather } | { success: false; error: string }

export type TriggerWeatherResult =
  { success: true; taskId: string } | { success: false; error: string }

export type TidalGatesResult =
  { success: true; data: TidalGateWarning[] } | { success: false; error: string }

export type TidalDiamondsResult =
  { success: true; data: TidalDiamond[] } | { success: false; error: string }

export type DiamondMutationResult =
  { success: true; data: TidalStation } | { success: false; error: string }

export type DiamondDeleteResult = { success: true } | { success: false; error: string }

export type DiamondEditViewResult =
  { success: true; data: TidalDiamondEdit } | { success: false; error: string }

export type VelocityGridResult =
  { success: true; data: VelocityGridData } | { success: false; error: string }

type SeaUpdateFields = Partial<
  Pick<
    Sea,
    | "moonPhase"
    | "highTide"
    | "lowTide"
    | "tidalRangeM"
    | "referencePortName"
    | "hwTimeOffsetMinutes"
    | "lwTimeOffsetMinutes"
    | "hwHeightRatio"
    | "lwHeightRatio"
    | "tidalSource"
    | "floodDirectionDegrees"
    | "ebbDirectionDegrees"
    | "maxSpringRateKnots"
    | "maxNeapRateKnots"
  >
>

export async function fetchDaySea(dayId: string): Promise<SeaActionResult> {
  try {
    const raw = await apiGet<unknown>(`/api/day/${dayId}/sea`)
    const data = SeaSchema.parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch sea data." }
  }
}

export async function updateDaySea(
  dayId: string,
  fields: SeaUpdateFields,
): Promise<SeaActionResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/day/${dayId}/sea`, fields)
    const data = SeaSchema.parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update sea data." }
  }
}

export async function fetchDayWeather(dayId: string): Promise<WeatherActionResult> {
  try {
    const raw = await apiGet<unknown>(`/api/day/${dayId}/weather`)
    const data = WeatherSchema.parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch weather data.",
    }
  }
}

export async function triggerWeatherFetch(dayId: string): Promise<TriggerWeatherResult> {
  try {
    const result = await apiPost<{ taskId: string }>(`/api/day/${dayId}/weather/fetch`, {})
    return { success: true, taskId: result.taskId }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to trigger weather fetch.",
    }
  }
}

export async function fetchTidalGates(dayId: string): Promise<TidalGatesResult> {
  try {
    const raw = await apiGet<unknown>(`/api/day/${dayId}/tidal-gates`)
    const data = z.array(TidalGateWarningSchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch tidal gates.",
    }
  }
}

export async function fetchWindVectors(dayId: string, hour: number): Promise<VelocityGridResult> {
  try {
    const data = await apiGet<VelocityGridData>(`/api/day/${dayId}/wind-vectors?hour=${hour}`)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch wind vectors.",
    }
  }
}

export async function fetchWaveVectors(dayId: string, hour: number): Promise<VelocityGridResult> {
  try {
    const data = await apiGet<VelocityGridData>(`/api/day/${dayId}/wave-vectors?hour=${hour}`)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch wave vectors.",
    }
  }
}

export async function fetchTidalDiamonds(
  dayId: string,
  hour: number,
): Promise<TidalDiamondsResult> {
  try {
    const raw = await apiGet<unknown>(`/api/day/${dayId}/tidal-diamonds?hour=${hour}`)
    const data = z.array(TidalDiamondSchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch tidal diamonds.",
    }
  }
}

export async function fetchGlobalWindVectors(
  date: string,
  hour: number,
): Promise<VelocityGridResult> {
  try {
    const data = await apiGet<VelocityGridData>(
      `/api/day/global-wind-vectors?date=${date}&hour=${hour}`,
    )
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch global wind vectors.",
    }
  }
}

// Maps the validated entry form to the API body, sending only the fields the
// chosen entry mode uses (simple peaks vs. an atlas per-hour table).
function diamondBody(fields: TidalDiamondForm) {
  const base = { name: fields.name, entryMode: fields.entryMode, radiusM: fields.radiusM ?? null }
  if (fields.entryMode === "simple") {
    return {
      ...base,
      maxSpringRateKnots: fields.maxSpringRateKnots ?? null,
      maxNeapRateKnots: fields.maxNeapRateKnots ?? null,
      floodDirectionDegrees: fields.floodDirectionDegrees ?? null,
      ebbDirectionDegrees: fields.ebbDirectionDegrees ?? null,
    }
  }
  return { ...base, tidalStreamEntries: fields.tidalStreamEntries ?? [] }
}

export async function createTidalDiamond(
  itineraryId: string,
  lat: number,
  lng: number,
  fields: TidalDiamondForm,
): Promise<DiamondMutationResult> {
  try {
    const raw = await apiPost<unknown>(`/api/tidal-diamond/create`, {
      itineraryId,
      location: { type: "Point", coordinates: [lng, lat] },
      ...diamondBody(fields),
    })
    return { success: true, data: TidalStationSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create tidal diamond.",
    }
  }
}

export async function fetchTidalDiamondForEdit(diamondId: string): Promise<DiamondEditViewResult> {
  try {
    const raw = await apiGet<unknown>(`/api/tidal-diamond/${diamondId}`)
    return { success: true, data: TidalDiamondEditSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to load tidal diamond.",
    }
  }
}

export async function editTidalDiamond(
  diamondId: string,
  fields: TidalDiamondForm,
): Promise<DiamondMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/tidal-diamond/${diamondId}`, diamondBody(fields))
    return { success: true, data: TidalStationSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update tidal diamond.",
    }
  }
}

export async function repositionTidalDiamond(
  diamondId: string,
  lat: number,
  lng: number,
): Promise<DiamondMutationResult> {
  try {
    const raw = await apiPatch<unknown>(`/api/tidal-diamond/${diamondId}`, {
      location: { type: "Point", coordinates: [lng, lat] },
    })
    return { success: true, data: TidalStationSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to move tidal diamond.",
    }
  }
}

export async function deleteTidalDiamond(diamondId: string): Promise<DiamondDeleteResult> {
  try {
    await apiDelete(`/api/tidal-diamond/${diamondId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete tidal diamond.",
    }
  }
}
