"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch } from "@/lib/api/client"
import { TripMemberSchema } from "@/lib/dtos/trip-member"
import type { TripMember, FloatPlanFormValues } from "@/lib/dtos/trip-member"

export type FloatPlanActionResult = { success: true } | { success: false; error: string }

export async function getMyMembership(tripId: string): Promise<TripMember | null> {
  try {
    const raw = await apiGet(`/api/trip/${tripId}/member/me`)
    return TripMemberSchema.parse(raw)
  } catch {
    return null
  }
}

export async function updateMyFloatPlan(
  tripId: string,
  fields: FloatPlanFormValues
): Promise<FloatPlanActionResult> {
  try {
    await apiPatch(`/api/trip/${tripId}/member/me`, {
      vesselMake: fields.vesselMake || null,
      vesselModel: fields.vesselModel || null,
      vesselLengthCm: fields.vesselLengthCm === "" || fields.vesselLengthCm == null ? null : Number(fields.vesselLengthCm),
      vesselColorPrimary: fields.vesselColorPrimary || null,
      vesselColorSecondary: fields.vesselColorSecondary || null,
      emergencyContactName: fields.emergencyContactName || null,
      emergencyContactPhone: fields.emergencyContactPhone || null,
      emergencyContactRelationship: fields.emergencyContactRelationship || null,
    })
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update float plan." }
  }
}
