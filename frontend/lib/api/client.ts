import "server-only"
export { isRedirectError } from "next/dist/client/components/redirect-error"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { refreshSession } from "@/lib/auth/actions"
import { API_URL } from "@/lib/api/config"

async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get("access_token")?.value ?? null
}

async function apiFetch(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken()

  const res = await fetch(`${API_URL}${path}`, {
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
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const retry = !extraHeaders
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body), headers: extraHeaders }, retry)
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { message?: string } | null
    throw new Error(`POST ${path} failed: ${res.status}${detail?.message ? ` — ${detail.message}` : ""}`)
  }
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: "PUT", body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

// Partial update — sends only the changed fields.
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiDelete(path: string, extraHeaders?: Record<string, string>): Promise<void> {
  const retry = !extraHeaders
  const res = await apiFetch(path, { method: "DELETE", headers: extraHeaders }, retry)
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
}

// Multipart upload — omits Content-Type so the browser sets the boundary.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401) {
    const refreshed = await refreshSession()
    if (refreshed) return apiUpload(path, formData)
    redirect("/login")
  }
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}
