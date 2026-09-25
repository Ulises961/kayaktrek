"use server"

import { apiGetPublic, rethrowUnlessClientError } from "@/lib/api/client"
import { PublicUserSchema } from "@/lib/dtos/public-profile"
import type { PublicUser } from "@/lib/dtos/public-profile"

// Fetch a paddler's public profile by username. Auth-optional. Returns null for
// any non-public/missing/inactive profile — the backend returns a single 404 for
// all of those (no existence oracle), and we propagate that as "not found". A failed
// call (timeout, 5xx) is not "not found" and rethrows to the error boundary.
export async function getPublicProfile(username: string): Promise<PublicUser | null> {
  try {
    const raw = await apiGetPublic<unknown>(`/api/user/${encodeURIComponent(username)}/public`)
    return PublicUserSchema.parse(raw)
  } catch (error) {
    rethrowUnlessClientError(error)
    return null
  }
}
