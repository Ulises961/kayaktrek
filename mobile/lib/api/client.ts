import { API_URL, API_PREFIX } from "./config"
import { appUserAgent } from "./user-agent"
import { getAccessToken } from "../auth/token-store"
import { refreshSession } from "../auth/refresh"

// Callers pass unversioned `/api/...` paths, same convention as the web client
// (frontend/lib/api/client.ts) so a path can be copied between the two verbatim.
function versionPath(path: string): string {
  return path.replace(/^\/api(?=\/|$)/, API_PREFIX)
}

// Mirrors frontend/lib/api/client.ts's errorMessage exactly — same backend error shape
// (Api/error_handlers.py: {error, message}), same rule that .message must always be
// something a user can read, never the raw "METHOD /path failed: <status>" wrapper.
async function errorMessage(method: string, path: string, res: Response): Promise<string> {
  const technical = `${method} ${path} failed: ${res.status}`
  let body: { message?: unknown } | null = null
  try {
    body = (await res.json()) as { message?: unknown } | null
  } catch {
    body = null
  }
  if (typeof body?.message === "string") return body.message
  if (body?.message && typeof body.message === "object") {
    const fieldErrors = Object.entries(body.message as Record<string, unknown>).map(
      ([field, messages]) =>
        `${field}: ${Array.isArray(messages) ? messages.join(", ") : String(messages)}`,
    )
    if (fieldErrors.length > 0) return fieldErrors.join("; ")
  }
  return technical
}

// Thrown when a request 401s and the one-shot refresh retry also fails — the mobile
// analogue of the web client's redirect("/login") (apiFetch there signals a dead session
// by throwing Next's redirect error). Here there's no throw-based navigation, so this is
// a plain marker callers can check; refreshSession() itself already called
// notifySessionExpired() to drive the (app) layout's <Redirect>, so callers generally
// don't need to catch this specifically — it exists so a caller CAN distinguish "session
// died" from "this particular request failed" if it needs to.
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired")
    this.name = "SessionExpiredError"
  }
}

// Exported so a screen can tell "the device has no connection" apart from any
// other thrown error message, without a live NetInfo subscription of its own —
// e.g. to show a specific "search needs a connection" line instead of a bare
// error banner.
export const OFFLINE_ERROR_MESSAGE = "Could not reach the server. Please check your connection and try again."

// For screens that hold their error as the message string they display.
export function isOfflineError(message: string | null): boolean {
  return message === OFFLINE_ERROR_MESSAGE
}

async function apiFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken()

  let res: Response
  try {
    res = await fetch(`${API_URL}${versionPath(path)}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        // Sent on every request, not just login: the backend re-resolves the device label
        // on refresh too, which is what heals sessions opened before this existed.
        "User-Agent": appUserAgent(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    // A transport-level failure (backend unreachable, or a connection reset mid-request
    // — e.g. Android's OkHttp "unexpected end of stream" when a stopped backend leaves
    // a stale keep-alive connection behind) never reaches an HTTP response at all; fetch
    // throws instead of resolving. Left unwrapped, that throw carries whatever the raw
    // native message happens to be straight into a screen's `err.message` display.
    // Normalize it here, once, for every apiGet/apiPost/apiPatch/apiDelete call site —
    // the same thing lib/auth/actions.ts's login() already does for the one call outside
    // this shared client.
    throw new Error(OFFLINE_ERROR_MESSAGE)
  }

  if (res.status === 401 && retry) {
    const refreshed = await refreshSession()
    if (refreshed) return apiFetch(path, options, false)
    throw new SessionExpiredError()
  }

  return res
}

// `headers` exists for the elevated-token flow: re-authenticating returns a short-lived
// token that the sensitive endpoints (email change) want on the request itself, not in
// the body, matching frontend/lib/profile/actions.ts's "X-Elevated-Token".
export async function apiGet<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const res = await apiFetch(path, { headers })
  if (!res.ok) throw new Error(await errorMessage("GET", path, res))
  return res.json() as Promise<T>
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body), headers })
  if (!res.ok) throw new Error(await errorMessage("POST", path, res))
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await errorMessage("PATCH", path, res))
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: "DELETE" })
  if (!res.ok) throw new Error(await errorMessage("DELETE", path, res))
}
