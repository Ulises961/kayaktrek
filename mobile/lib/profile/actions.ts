import { UserSchema, type User } from "@shared/dtos/user"
import { PublicUserSchema, type PublicUser } from "@shared/dtos/public-profile"
import type { DistanceUnit } from "@shared/itinerary/distance"

import { apiGet, apiPatch } from "../api/client"
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
