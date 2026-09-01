"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { apiGet, apiPatch, apiDelete, apiPost, apiUpload, isRedirectError } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import type { ProfileFormValues } from "@/lib/dtos/user"
import type { GeneratedKeypair, SealedValue } from "@/lib/crypto/medical"
import type { DistanceUnit } from "@/lib/itinerary/distance"

export type ProfileActionResult = { success: true } | { success: false; error: string }
export type AvatarActionResult =
  { success: true; avatarUrl: string | null } | { success: false; error: string }

export async function updateProfile(fields: ProfileFormValues): Promise<ProfileActionResult> {
  const session = await getSession()
  if (!session) redirect("/login")

  try {
    // phone is deliberately absent — it's account data, edited in Settings via
    // setPhone (M12 §F), and PATCHing it here would clear a stored number.
    await apiPatch(`/api/user/${session.userId}`, {
      name: fields.name,
      surname: fields.surname || null,
      username: fields.username,
      bio: fields.bio || null,
      homeLocation: fields.homeLocation || null,
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
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update profile." }
  }
}

// Toggle the opt-in public profile. Separated from the main profile form so the
// switch can flip instantly without round-tripping every other field.
export async function setProfileVisibility(isPublic: boolean): Promise<ProfileActionResult> {
  const session = await getSession()
  if (!session) redirect("/login")

  try {
    await apiPatch(`/api/user/${session.userId}`, { profileIsPublic: isPublic })
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to update profile visibility." }
  }
}

// Instant single-field toggle for the planner's unit switch — mirrors
// setProfileVisibility so the map builder doesn't have to round-trip the whole
// profile form just to flip nm/km. Read on both /profile (stats dashboard
// display) and /settings (the editing control, M12 §J) — revalidate both
// precisely rather than a blanket path.
export async function setUnitPreference(unit: DistanceUnit): Promise<ProfileActionResult> {
  const session = await getSession()
  if (!session) redirect("/login")

  try {
    await apiPatch(`/api/user/${session.userId}`, { unitPreference: unit })
    revalidatePath("/profile")
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to update unit preference." }
  }
}

// Single-field phone update for Settings (M12 §F — collected once, in an
// account-details context, instead of at signup). Mirrors setUnitPreference;
// an empty string clears the stored number.
export async function setPhone(phone: string): Promise<ProfileActionResult> {
  const session = await getSession()
  if (!session) redirect("/login")

  try {
    await apiPatch(`/api/user/${session.userId}`, { phone: phone.trim() || null })
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("400"))
      return { success: false, error: "Enter a valid phone number (7–15 digits)." }
    if (msg.includes("409"))
      return { success: false, error: "That phone number is already in use." }
    return { success: false, error: "Failed to update phone number." }
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

// rewrappedKey carries the private key re-encrypted under newPwd, computed client-side
// (M22) — the component that already holds both passwords does that, never this action.
// Omitted when the account has no keypair yet; required by the backend when it does.
export async function changePassword(
  currentPwd: string,
  newPwd: string,
  rewrappedKey?: SealedValue,
): Promise<ProfileActionResult> {
  try {
    await apiPatch("/api/user/me/password", {
      currentPwd,
      newPwd,
      ...(rewrappedKey && {
        privateKeyCiphertext: rewrappedKey.ciphertext,
        privateKeyNonce: rewrappedKey.nonce,
        privateKeySalt: rewrappedKey.salt,
      }),
    })
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
    if (msg.includes("429"))
      return { success: false, error: "You can only request a data export once per day." }
    return { success: false, error: "Failed to request data export." }
  }
}

export async function sendTestEmail(): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/dev/test-email", {})
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to send test email." }
  }
}

export async function requestAccountDeletion(): Promise<ProfileActionResult> {
  try {
    await apiDelete("/api/user/me")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to request account deletion.",
    }
  }
}

export type ReAuthResult =
  { success: true; elevatedToken: string } | { success: false; error: string }
// These carry ciphertext, never notes and never a password (M22). A server action's arguments
// cross the network to the Next server, so a password parameter here would defeat the point of
// moving the crypto to the browser — the plaintext would just leave the device one hop earlier.
// Everything below is transport: it must not interpret what the browser sealed.
export type SealedNotesResult =
  { success: true; sealed: SealedValue | null } | { success: false; error: string }
export type KeypairResult =
  { success: true; keypair: GeneratedKeypair } | { success: false; error: string }

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

export async function getMedicalNotes(elevatedToken: string): Promise<SealedNotesResult> {
  try {
    const data = await apiGet<Partial<SealedValue>>("/api/user/me/medical-notes", {
      "X-Elevated-Token": elevatedToken,
    })
    // All three fields come back null when nothing is stored — the ordinary state of a new
    // account, which the backend deliberately does not report as a 404.
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

export async function grantMedicalConsent(
  elevatedToken: string,
  sealed: SealedValue,
): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/user/me/medical-consent", sealed, { "X-Elevated-Token": elevatedToken })
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to save medical notes." }
  }
}

export async function storeKeypair(
  elevatedToken: string,
  keypair: GeneratedKeypair,
): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/user/me/keypair", keypair, { "X-Elevated-Token": elevatedToken })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    // 409 means a keypair is already stored. The account has what it needs and the one we
    // generated is discarded — replacing it would orphan every note encrypted under the first.
    if (msg.includes("409")) return { success: true }
    if (msg.includes("403")) return { success: false, error: "Session expired. Please try again." }
    return { success: false, error: "Failed to set up encryption keypair." }
  }
}

export async function getKeypair(elevatedToken: string): Promise<KeypairResult> {
  try {
    const keypair = await apiGet<GeneratedKeypair>("/api/user/me/keypair", {
      "X-Elevated-Token": elevatedToken,
    })
    return { success: true, keypair }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("404"))
      return { success: false, error: "Set up medical note encryption first." }
    if (msg.includes("403")) return { success: false, error: "Session expired. Please try again." }
    return { success: false, error: "Failed to load your encryption keys." }
  }
}

export async function requestEmailChange(
  elevatedToken: string,
  newMail: string,
): Promise<ProfileActionResult> {
  try {
    await apiPost("/api/user/me/email-change", { newMail }, { "X-Elevated-Token": elevatedToken })
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    if (msg.includes("400"))
      return { success: false, error: "That address can't be used. Try a different one." }
    return { success: false, error: "Failed to request email change." }
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
    if (msg.includes("403"))
      return { success: false, error: "Session expired. Please lock and unlock again." }
    return { success: false, error: "Failed to revoke medical consent." }
  }
}
