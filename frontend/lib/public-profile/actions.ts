"use server"

import { apiGetPublic } from "@/lib/api/client"
import { PublicUserSchema } from "@/lib/dtos/public-profile"
import type { PublicUser } from "@/lib/dtos/public-profile"

// Fetch a paddler's public profile by username. Auth-optional. Returns null for
// any non-public/missing/inactive profile — the backend returns a single 404 for
// all of those (no existence oracle), and we propagate that as "not found".
export async function getPublicProfile(username: string): Promise<PublicUser | null> {
  try {
    const raw = await apiGetPublic<unknown>(`/api/user/${encodeURIComponent(username)}/public`)
    return PublicUserSchema.parse(raw)
  } catch {
    return null
  }
}
