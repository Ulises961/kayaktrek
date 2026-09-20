import { UserSchema, type User } from "@shared/dtos/user"
import { PublicUserSchema, type PublicUser } from "@shared/dtos/public-profile"
import type { DistanceUnit } from "@shared/itinerary/distance"

import { apiDelete, apiGet, apiPatch, apiPost } from "../api/client"
import { getSession } from "../auth/session"

// GET /api/v1/user/me
export async function getMe(): Promise<User> {
  const raw = await apiGet<unknown>("/api/user/me")
  return UserSchema.parse(raw)
}

// Auth-optional on the backend, but every mobile route sits behind the (app) auth
// guard anyway — undifferentiated 404 for missing/inactive/deletion-pending/non-public,
// no existence oracle (M7a), surfaced here as null rather than a thrown error.
export async function getPublicProfile(username: string): Promise<PublicUser | null> {
  try {
    const raw = await apiGet<unknown>(`/api/user/${encodeURIComponent(username)}/public`)
    return PublicUserSchema.parse(raw)
  } catch {
    return null
  }
}

// Deliberately narrower than web's ProfileFormSchema (frontend/lib/dtos/user.ts) —
// vessel/emergency-contact fields are float-plan territory, out of scope for M9i
// (plans/M9i.md WP1 only covers the M7a identity fields).
export type ProfileEditFields = {
  name: string
  surname?: string | null
  username: string
  bio?: string | null
  homeLocation?: string | null
}

export async function updateProfile(fields: ProfileEditFields): Promise<User> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const raw = await apiPatch<unknown>(`/api/user/${session.userId}`, {
    name: fields.name,
    surname: fields.surname || null,
    username: fields.username,
    bio: fields.bio || null,
    homeLocation: fields.homeLocation || null,
  })
  return UserSchema.parse(raw)
}

// Separated from the main edit form so the switch can flip instantly, matching
// web's setProfileVisibility (frontend/lib/profile/actions.ts).
export async function setProfileVisibility(isPublic: boolean): Promise<User> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const raw = await apiPatch<unknown>(`/api/user/${session.userId}`, {
    profileIsPublic: isPublic,
  })
  return UserSchema.parse(raw)
}

// Instant single-field toggle, matching web's setUnitPreference
// (frontend/lib/profile/actions.ts) — same endpoint/payload shape.
export async function setUnitPreference(unit: DistanceUnit): Promise<User> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const raw = await apiPatch<unknown>(`/api/user/${session.userId}`, {
    unitPreference: unit,
  })
  return UserSchema.parse(raw)
}

// Single-field phone update for Settings, mirroring web's setPhone
// (frontend/lib/profile/actions.ts). Cleared as null, not "" — an empty string is a
// value the column would store, where the backend's validator expects an absence.
export async function setPhone(phone: string): Promise<User> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const raw = await apiPatch<unknown>(`/api/user/${session.userId}`, {
    phone: phone.trim() || null,
  })
  return UserSchema.parse(raw)
}

// No `rewrappedKey` argument, unlike web's changePassword. That parameter carries the
// medical-notes private key re-encrypted under the new password (M22), and medical notes
// are parked (M24) — mobile has no keypair to rewrap and no surface that could produce
// one. The backend only requires it when the account actually has a keypair.
export async function changePassword(currentPwd: string, newPwd: string): Promise<void> {
  await apiPatch("/api/user/me/password", { currentPwd, newPwd })
}

// Exchanges the password for a short-lived elevated token, which the sensitive endpoints
// want as an X-Elevated-Token header.
export async function reAuthenticate(password: string): Promise<string> {
  const data = await apiPost<{ elevatedToken: string }>("/api/user/me/re-auth", { password })
  return data.elevatedToken
}

// Does not change the address: it sends a confirmation link to the new one, and the
// change lands when that link is followed. `pendingMail` on the user reflects the wait.
export async function requestEmailChange(elevatedToken: string, newMail: string): Promise<void> {
  await apiPost("/api/user/me/email-change", { newMail }, { "X-Elevated-Token": elevatedToken })
}

export async function requestDataExport(): Promise<void> {
  await apiPost("/api/user/me/data-export", {})
}

// Requests deletion rather than performing it — the account enters a 30-day window in
// which it can be cancelled by signing in again (GDPR erasure task).
export async function requestAccountDeletion(): Promise<void> {
  await apiDelete("/api/user/me")
}
