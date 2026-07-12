"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch, apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import { TripMemberSchema } from "@/lib/dtos/trip-member"
import type { TripMember, FloatPlanFormValues } from "@/lib/dtos/trip-member"

export type FloatPlanActionResult = { success: true } | { success: false; error: string }
export type ShareMedicalNotesResult = { success: true } | { success: false; error: string }
export type TripMedicalNotesResult =
  | { success: true; notes: string | null }
  | { success: false; error: string }
export type ReadMemberNotesResult =
  | { success: true; medicalNotes: string }
  | { success: false; error: string }

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
  fields: FloatPlanFormValues,
): Promise<FloatPlanActionResult> {
  try {
    await apiPatch(`/api/trip/${tripId}/member/me`, {
      vesselMake: fields.vesselMake || null,
      vesselModel: fields.vesselModel || null,
      vesselLengthCm:
        fields.vesselLengthCm === "" || fields.vesselLengthCm == null
          ? null
          : Number(fields.vesselLengthCm),
      vesselColorPrimary: fields.vesselColorPrimary || null,
      vesselColorSecondary: fields.vesselColorSecondary || null,
      emergencyContactName: fields.emergencyContactName || null,
      emergencyContactPhone: fields.emergencyContactPhone || null,
      emergencyContactRelationship: fields.emergencyContactRelationship || null,
    })
    // The own-editing segment plus the leader-facing printable plan (crew manifest).
    revalidatePath(`/trips/${tripId}/my-float-plan`)
    revalidatePath(`/trips/${tripId}/float-plan`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update float plan.",
    }
  }
}

export async function getTripMedicalNotes(
  tripId: string,
  elevatedToken: string,
  password: string,
): Promise<TripMedicalNotesResult> {
  try {
    const data = await apiPost<{ medicalNotes: string | null }>(
      `/api/trip/${tripId}/member/me/medical-notes`,
      { password },
      { "X-Elevated-Token": elevatedToken },
    )
    return { success: true, notes: data.medicalNotes ?? null }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("401"))
      return {
        success: false,
        error: "Could not decrypt notes — they may have been saved with a different password.",
      }
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: `Failed to load medical notes (${msg}).` }
  }
}

export async function setTripMedicalNotes(
  tripId: string,
  medicalNotes: string,
  elevatedToken: string,
  password: string,
): Promise<FloatPlanActionResult> {
  try {
    await apiPost(
      `/api/trip/${tripId}/member/me/medical-consent`,
      { medicalNotes, password },
      { "X-Elevated-Token": elevatedToken },
    )
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to save medical notes." }
  }
}

export async function revokeTripMedicalNotes(
  tripId: string,
  elevatedToken: string,
): Promise<FloatPlanActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}/member/me/medical-consent`, {
      "X-Elevated-Token": elevatedToken,
    })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to delete medical notes." }
  }
}

export async function readMemberMedicalNotes(
  tripId: string,
  memberId: string,
  password: string,
): Promise<ReadMemberNotesResult> {
  try {
    // Elevated token required by the endpoint — re-auth inline with the same password
    const reAuthData = await apiPost<{ elevatedToken: string }>("/api/user/me/re-auth", {
      password,
    })
    const elevatedToken = reAuthData.elevatedToken
    const data = await apiPost<{ medicalNotes: string }>(
      `/api/trip/${tripId}/member/${memberId}/medical-notes`,
      { password },
      { "X-Elevated-Token": elevatedToken },
    )
    return { success: true, medicalNotes: data.medicalNotes }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("401")) return { success: false, error: "Incorrect password." }
    if (msg.includes("403"))
      return { success: false, error: "Only the trip leader can read shared notes." }
    if (msg.includes("404")) return { success: false, error: "No shared notes for this member." }
    return { success: false, error: "Failed to read medical notes." }
  }
}

export async function shareMedicalNotes(
  tripId: string,
  elevatedToken: string,
  password: string,
): Promise<ShareMedicalNotesResult> {
  try {
    await apiPost(
      `/api/trip/${tripId}/member/me/share-medical-notes`,
      { password },
      { "X-Elevated-Token": elevatedToken },
    )
    // hasTripMedicalNotes/sharedAt state is only rendered on the own segment.
    revalidatePath(`/trips/${tripId}/my-float-plan`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("400"))
      return { success: false, error: "Please save notes before sharing with the trip leader." }
    if (msg.includes("401"))
      return {
        success: false,
        error: "Could not decrypt notes — they may have been saved with a different password.",
      }
    if (msg.includes("403")) return { success: false, error: "Session expired. Please try again." }
    return { success: false, error: `Failed to share medical notes (${msg}).` }
  }
}
