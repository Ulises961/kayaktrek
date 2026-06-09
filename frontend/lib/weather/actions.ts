"use server"

import { apiGet, apiPost, apiPatch, isRedirectError } from "@/lib/api/client"
import { SeaSchema } from "@/lib/dtos/sea"
import type { Sea } from "@/lib/dtos/sea"
import { WeatherSchema } from "@/lib/dtos/weather"
import type { Weather } from "@/lib/dtos/weather"
import { TidalGateWarningSchema } from "@/lib/dtos/tidal-station"
import type { TidalGateWarning } from "@/lib/dtos/tidal-station"
import { z } from "zod"

export type SeaActionResult =
  | { success: true; data: Sea }
  | { success: false; error: string }

export type WeatherActionResult =
  | { success: true; data: Weather }
  | { success: false; error: string }

export type TriggerWeatherResult =
  | { success: true; taskId: string }
  | { success: false; error: string }

export type TidalGatesResult =
  | { success: true; data: TidalGateWarning[] }
  | { success: false; error: string }

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
  fields: Partial<Pick<Sea, "moonPhase" | "highTide" | "lowTide" | "tidalRangeM">>
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
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch weather data." }
  }
}

export async function triggerWeatherFetch(dayId: string): Promise<TriggerWeatherResult> {
  try {
    const result = await apiPost<{ taskId: string }>(`/api/day/${dayId}/weather/fetch`, {})
    return { success: true, taskId: result.taskId }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to trigger weather fetch." }
  }
}

export async function fetchTidalGates(dayId: string): Promise<TidalGatesResult> {
  try {
    const raw = await apiGet<unknown>(`/api/day/${dayId}/tidal-gates`)
    const data = z.array(TidalGateWarningSchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch tidal gates." }
  }
}
