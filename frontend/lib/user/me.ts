import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { apiGet, rethrowIfRedirect } from "@/lib/api/client"
import { UserSchema, type User } from "@/lib/dtos/user"

// The single fetcher for the authenticated user record. Wrapped in React `cache()` so
// every server component in one request — layout keypair banner, sidebar, dashboard
// greeting, profile — shares ONE upstream `/api/user/me` call instead of each issuing
// its own. Returns null on failure so callers can degrade gracefully; callers that
// require a user (e.g. the profile page) can `notFound()` on null.
export const getMe = cache(async (): Promise<User | null> => {
  // Public pages call this to personalise for whoever happens to be signed in, so an
  // anonymous caller is normal here, not a dead session. Without this check the request
  // would 401, fail to refresh, and redirect a legitimate anonymous reader to /login.
  // Any auth cookie at all means there *is* a session to speak of — a stale one still
  // gets to redirect below.
  const cookieStore = await cookies()
  const hasCredentials = cookieStore.get("access_token") || cookieStore.get("refresh_token")
  if (!hasCredentials) return null

  try {
    const raw = await apiGet<unknown>("/api/user/me")
    return UserSchema.parse(raw)
  } catch (error) {
    rethrowIfRedirect(error)
    return null
  }
})
