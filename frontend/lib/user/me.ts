import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiGet, isRedirectError } from "@/lib/api/client"
import { UserSchema, type User } from "@/lib/dtos/user"

/**
 * The single upstream `/api/user/me` call, wrapped in React `cache()` so every server
 * component in one request — layout keypair banner, sidebar, dashboard greeting, profile —
 * shares ONE call instead of each issuing its own.
 *
 * It reports what happened rather than acting on it. `sessionDead` means credentials were
 * present but unusable; what that should DO is the caller's business, and the two accessors
 * below want opposite things — which is why the decision cannot live in here. Sharing one
 * cache also means a page may call either accessor without a second round trip.
 */
const loadMe = cache(async (): Promise<{ user: User | null; sessionDead: boolean }> => {
  // No credentials at all is not a dead session, it is an anonymous visitor. Asking the API
  // would 401, fail to refresh, and bounce someone who never claimed to be signed in.
  const cookieStore = await cookies()
  const hasCredentials = cookieStore.get("access_token") || cookieStore.get("refresh_token")
  if (!hasCredentials) return { user: null, sessionDead: false }

  try {
    const raw = await apiGet<unknown>("/api/user/me")
    return { user: UserSchema.parse(raw), sessionDead: false }
  } catch (error) {
    // apiFetch signals an unrecoverable session by calling redirect("/login"), and Next
    // implements redirect() by throwing. Catching it here turns the signal into a fact the
    // callers can act on — getMe re-raises it, so it is deferred, never dropped.
    if (isRedirectError(error)) return { user: null, sessionDead: true }
    // Anything else (a 500, a schema mismatch) is a failed fetch, not a verdict on the
    // session — degrade to null and let the page render what it can.
    return { user: null, sessionDead: false }
  }
})

/**
 * The signed-in user, for pages that require one — every `(app)` route.
 *
 * A dead session redirects to /login: M17's instant revocation made "signed out" reachable
 * in seconds, and without this a revoked device renders an empty page that reads as a broken
 * app rather than as a sign-out. Returns null on an ordinary fetch failure so callers can
 * still degrade (`UserMenu` renders regardless, so sign-out never depends on this call).
 */
export async function getMe(): Promise<User | null> {
  const { user, sessionDead } = await loadMe()
  if (sessionDead) redirect("/login")
  return user
}

/**
 * Whoever happens to be looking, which may be nobody — for anonymous-reachable pages.
 *
 * Those pages call this only to personalise (unit preference, "open" vs "fork"), so no auth
 * state may decide whether the page renders at all. That makes `getMe()` wrong for them: it
 * treats unusable credentials as a dead session and redirects, turning a public link into a
 * login wall for anyone merely holding a stale cookie — a revoked session, a 30-day-expired
 * refresh token, or every existing user on their first load after the M17 deploy, since
 * pre-M17 refresh tokens carry no `sid` and cannot be refreshed.
 *
 * Use this on any route reachable without signing in, whether it lives in `(public)` or, like
 * `/explore`, in `(app)` for the sidebar shell while staying ungated in `proxy.ts`.
 */
export async function getViewer(): Promise<User | null> {
  return (await loadMe()).user
}
