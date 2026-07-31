import "server-only"
export { isRedirectError } from "next/dist/client/components/redirect-error"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { refreshSession } from "@/lib/auth/actions"
import { API_URL, API_PREFIX } from "@/lib/api/config"

// Callers pass unversioned `/api/...` paths; rewrite the leading `/api` segment to
// the versioned prefix in this single place so the API version lives in one constant.
function versionPath(path: string): string {
  return path.replace(/^\/api(?=\/|$)/, API_PREFIX)
}

async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get("access_token")?.value ?? null
}

// The backend's error handler always shapes a failure body as
// {error: <category>, message: <detail>} (Api/error_handlers.py) — `message` is
// either a plain string or, for Marshmallow validation failures, a
// {field: [errors]} object. This is the single place that turns a failed
// Response into the Error every server action re-throws (typically via
// `e instanceof Error ? e.message : "..."`), so it's also the single place
// responsible for making sure `.message` is something a user can actually
// read — never the raw "METHOD /path failed: <status>" wrapper, which is for
// server-side logs, not toasts/UI text.
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

async function apiFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken()

  const res = await fetch(`${API_URL}${versionPath(path)}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401 && retry) {
    const refreshed = await refreshSession()
    if (refreshed) return apiFetch(path, options, false)
    redirect("/login")
  }

  return res
}

export async function apiGet<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await apiFetch(path, { headers: extraHeaders })
  if (!res.ok) throw new Error(await errorMessage("GET", path, res))
  return res.json() as Promise<T>
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const retry = !extraHeaders
  const res = await apiFetch(
    path,
    { method: "POST", body: JSON.stringify(body), headers: extraHeaders },
    retry,
  )
  if (!res.ok) throw new Error(await errorMessage("POST", path, res))
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: "PUT", body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await errorMessage("PUT", path, res))
  return res.json() as Promise<T>
}

// Partial update — sends only the changed fields.
export async function apiPatch<T>(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const retry = !extraHeaders
  const res = await apiFetch(
    path,
    { method: "PATCH", body: JSON.stringify(body), headers: extraHeaders },
    retry,
  )
  if (!res.ok) throw new Error(await errorMessage("PATCH", path, res))
  return res.json() as Promise<T>
}

export async function apiDelete(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const retry = !extraHeaders
  const res = await apiFetch(path, { method: "DELETE", headers: extraHeaders }, retry)
  if (!res.ok) throw new Error(await errorMessage("DELETE", path, res))
}

// Unauthenticated GET — for public endpoints that must not redirect to /login on failure.
// Callers (fetchLandingRoutes and friends) already treat any thrown error as best-effort
// degradation to empty data, but without a bound on the request itself, an unresponsive
// backend hangs indefinitely instead of failing fast into that fallback — surfaced when a
// Docker build's static generation of the (auth) pages timed out entirely rather than
// degrading, because the production API wasn't reachable yet at build time.
export async function apiGetPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${versionPath(path)}`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(await errorMessage("GET", path, res))
  return res.json() as Promise<T>
}

// Multipart upload — omits Content-Type so the browser sets the boundary. Kept separate
// from apiFetch (rather than reusing it) for exactly that reason: apiFetch always sets
// Content-Type: application/json, which a plain object spread can't unset for a FormData body.
export async function apiUpload<T>(path: string, formData: FormData, retry = true): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}${versionPath(path)}`, {
    method: "POST",
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401 && retry) {
    const refreshed = await refreshSession()
    if (refreshed) return apiUpload(path, formData, false)
    redirect("/login")
  }
  if (!res.ok) throw new Error(await errorMessage("POST", path, res))
  return res.json() as Promise<T>
}
