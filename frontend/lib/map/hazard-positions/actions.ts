"use server"

import { apiGet, isRedirectError } from "@/lib/api/client"
import { HazardDiamondPositionSchema, type HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"
import { z } from "zod"

export type HazardPositionsResult =
  { success: true; data: HazardDiamondPosition[] } | { success: false; error: string }

export async function fetchNearbyHazardPositions(
  lat: number,
  lng: number,
  rangeKm: number,
): Promise<HazardPositionsResult> {
  try {
    const raw = await apiGet<unknown>(
      `/api/hazard-diamond/nearby?lat=${lat}&lng=${lng}&range=${rangeKm}`,
    )
    const data = z.array(HazardDiamondPositionSchema).parse(raw)
    return { success: true, data }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to fetch nearby hazard positions.",
    }
  }
}
