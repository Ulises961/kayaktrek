"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch, apiPost, apiPut, apiDelete, isRedirectError } from "@/lib/api/client"
import { TripMemberSchema } from "@/lib/dtos/trip-member"
import type { TripMember, FloatPlanFormValues } from "@/lib/dtos/trip-member"
import type { SealedValue } from "@/lib/crypto/medical"

export type FloatPlanActionResult = { success: true } | { success: false; error: string }
export type ShareMedicalNotesResult = { success: true } | { success: false; error: string }
// Ciphertext, never notes and never a password (M22) — see the same note in
// lib/profile/actions.ts for why a password parameter here would defeat the point.
export type TripMedicalNotesResult =
  { success: true; sealed: SealedValue | null } | { success: false; error: string }
export type LeaderPublicKeyResult =
  { success: true; publicKey: string } | { success: false; error: string }

/**
 * The leader's copy is ECIES-sealed, so it carries the sender's ephemeral public key in
 * place of a password salt. `ephemeralKey` is the wire name; the crypto module calls the
 * same value `ephemeralPublicKey`.
 */
export interface SealedForLeader {
  ciphertext: string
  nonce: string
  ephemeralKey: string
}
export type ReadMemberNotesResult =
  { success: true; sealed: SealedForLeader } | { success: false; error: string }

export async function getMyMembership(tripId: string): Promise<TripMember | null> {
  try {
    const raw = await apiGet(`/api/trip/${tripId}/member/me`)
    return TripMemberSchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
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
    revalidatePath(`/trips/float-plan/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update float plan.",
    }
  }
}

/**
 * Switches the caller's registered satellite feed on or off for one trip (M29). Its own
 * endpoint rather than the float-plan PATCH, which stamps the plan as confirmed.
 */
export async function setSatelliteTracking(
  tripId: string,
  enabled: boolean,
): Promise<FloatPlanActionResult> {
  try {
    await apiPut(`/api/trip/${tripId}/member/me/satellite-tracking`, { enabled })
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update inReach sharing.",
    }
  }
}

export async function getTripMedicalNotes(
  tripId: string,
  elevatedToken: string,
): Promise<TripMedicalNotesResult> {
  try {
    const data = await apiGet<Partial<SealedValue>>(`/api/trip/${tripId}/member/me/medical-notes`, {
      "X-Elevated-Token": elevatedToken,
    })
    // All three fields come back null when nothing is stored — the ordinary state of a new
    // membership, which the backend deliberately does not report as a 404.
    if (!data.ciphertext || !data.nonce || !data.salt) return { success: true, sealed: null }
    return {
      success: true,
      sealed: { ciphertext: data.ciphertext, nonce: data.nonce, salt: data.salt },
    }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: `Failed to load medical notes (${msg}).` }
  }
}

export async function setTripMedicalNotes(
  tripId: string,
  elevatedToken: string,
  sealed: SealedValue,
): Promise<FloatPlanActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/member/me/medical-consent`, sealed, {
      "X-Elevated-Token": elevatedToken,
    })
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
  elevatedToken: string,
): Promise<ReadMemberNotesResult> {
  try {
    const sealed = await apiGet<SealedForLeader>(
      `/api/trip/${tripId}/member/${memberId}/medical-notes`,
      { "X-Elevated-Token": elevatedToken },
    )
    return { success: true, sealed }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("403"))
      return { success: false, error: "Only the trip leader can read shared notes." }
    if (msg.includes("404")) return { success: false, error: "No shared notes for this member." }
    return { success: false, error: "Failed to read medical notes." }
  }
}

export async function getLeaderPublicKey(tripId: string): Promise<LeaderPublicKeyResult> {
  try {
    const data = await apiGet<{ publicKey: string }>(
      `/api/trip/${tripId}/member/me/leader-public-key`,
    )
    return { success: true, publicKey: data.publicKey }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("400"))
      return {
        success: false,
        error: "The trip leader has not set up encryption yet — ask them to, then try again.",
      }
    return { success: false, error: "Failed to prepare notes for the trip leader." }
  }
}

export async function shareMedicalNotes(
  tripId: string,
  elevatedToken: string,
  sealed: SealedForLeader,
): Promise<ShareMedicalNotesResult> {
  try {
    await apiPost(`/api/trip/${tripId}/member/me/share-medical-notes`, sealed, {
      "X-Elevated-Token": elevatedToken,
    })
    // hasTripMedicalNotes/sharedAt state is only rendered on the own segment.
    revalidatePath(`/trips/${tripId}/my-float-plan`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("400"))
      return { success: false, error: "Please save notes before sharing with the trip leader." }
    if (msg.includes("403")) return { success: false, error: "Session expired. Please try again." }
    return { success: false, error: `Failed to share medical notes (${msg}).` }
  }
}
