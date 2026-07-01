import "server-only"
import { cache } from "react"
import { apiGet } from "@/lib/api/client"
import { UserSchema, type User } from "@/lib/dtos/user"

// The single fetcher for the authenticated user record. Wrapped in React `cache()` so
// every server component in one request — layout keypair banner, sidebar, dashboard
// greeting, profile — shares ONE upstream `/api/user/me` call instead of each issuing
// its own. Returns null on failure so callers can degrade gracefully; callers that
// require a user (e.g. the profile page) can `notFound()` on null.
export const getMe = cache(async (): Promise<User | null> => {
  try {
    const raw = await apiGet<unknown>("/api/user/me")
    return UserSchema.parse(raw)
  } catch {
    return null
  }
})
