"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { apiGet, apiPatch, apiDelete, apiPost, apiUpload, isRedirectError } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import type { ProfileFormValues } from "@/lib/dtos/user"

export type ProfileActionResult = { success: true } | { success: false; error: string }
export type AvatarActionResult = { success: true; avatarUrl: string | null } | { success: false; error: string }

export async function updateProfile(fields: ProfileFormValues): Promise<ProfileActionResult> {
  const session = await getSession()
  if (!session) redirect("/login")

  try {
    await apiPatch(`/api/user/${session.userId}`, {
      name: fields.name,
      surname: fields.surname || null,
      phone: fields.phone || null,
      username: fields.username,
      vesselMake: fields.vesselMake || null,
      vesselModel: fields.vesselModel || null,
      vesselLengthCm: fields.vesselLengthCm === "" || fields.vesselLengthCm == null ? null : Number(fields.vesselLengthCm),
      vesselColorPrimary: fields.vesselColorPrimary || null,
      vesselColorSecondary: fields.vesselColorSecondary || null,
      emergencyContactName: fields.emergencyContactName || null,
      emergencyContactPhone: fields.emergencyContactPhone || null,
      emergencyContactRelationship: fields.emergencyContactRelationship || null,
    })
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update profile." }
  }
}

export async function uploadAvatar(formData: FormData): Promise<AvatarActionResult> {
  try {
    const raw = await apiUpload<unknown>("/api/user/me/avatar", formData)
    const user = UserSchema.parse(raw)
    revalidatePath("/profile")
    return { success: true, avatarUrl: user.avatarUrl ?? null }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to upload avatar." }
  }
}

export async function removeAvatar(): Promise<ProfileActionResult> {
  try {
    await apiDelete("/api/user/me/avatar")
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove avatar." }
  }
}

export async function changePassword(currentPwd: string, newPwd: string): Promise<ProfileActionResult> {
  try {
    await apiPatch("/api/user/me/password", { currentPwd, newPwd })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("400")) return { success: false, error: "Current password is incorrect." }
    return { success: false, error: "Failed to change password." }
  }
}

export async function requestDataExport(): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/user/me/data-export", {})
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("429")) return { success: false, error: "You can only request a data export once per day." }
    return { success: false, error: "Failed to request data export." }
  }
}

export async function requestAccountDeletion(): Promise<ProfileActionResult> {
  try {
    await apiDelete("/api/user/me")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to request account deletion." }
  }
}

export type ReAuthResult = { success: true; elevatedToken: string } | { success: false; error: string }
export type MedicalNotesResult = { success: true; notes: string | null } | { success: false; error: string }

export async function reAuth(password: string): Promise<ReAuthResult> {
  try {
    const data = await apiPost<{ elevatedToken: string }>("/api/user/me/re-auth", { password })
    return { success: true, elevatedToken: data.elevatedToken }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("401")) return { success: false, error: "Password incorrect." }
    return { success: false, error: "Re-authentication failed." }
  }
}

export async function getMedicalNotes(elevatedToken: string, password: string): Promise<MedicalNotesResult> {
  try {
    const data = await apiPost<{ medicalNotes: string | null }>(
      "/api/user/me/medical-notes",
      { password },
      { "X-Elevated-Token": elevatedToken }
    )
    return { success: true, notes: data.medicalNotes ?? null }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("400")) return { success: true, notes: null }
    if (msg.includes("401")) return { success: false, error: "Could not decrypt notes — notes may have been saved with a different password." }
    if (msg.includes("403")) return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: `Failed to load medical notes (${msg}).` }
  }
}

export async function grantMedicalConsent(
  elevatedToken: string,
  medicalNotes: string,
  password: string
): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/user/me/medical-consent", { medicalNotes, password }, { "X-Elevated-Token": elevatedToken })
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("403")) return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to save medical notes." }
  }
}

export async function revokeMedicalConsent(elevatedToken: string): Promise<ProfileActionResult> {
  try {
    await apiDelete("/api/user/me/medical-consent", { "X-Elevated-Token": elevatedToken })
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("403")) return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to revoke medical consent." }
  }
}
