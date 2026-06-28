import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

// API helpers for the M7b social graph (paddler connections, blocking, endorsement
// requests). Used to set up and tear down graph state deterministically so the UI
// specs assert against one well-defined transition each.

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function apiGetMe(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string; username: string; [key: string]: unknown }> {
  const res = await request.get(`${API_URL}/api/v1/user/me`, { headers: auth(token) })
  if (!res.ok()) throw new Error(`getMe failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiSetProfilePublic(
  request: APIRequestContext,
  token: string,
  userId: string,
  isPublic: boolean,
): Promise<void> {
  const res = await request.patch(`${API_URL}/api/v1/user/${userId}`, {
    headers: auth(token),
    data: { profileIsPublic: isPublic },
  })
  if (!res.ok()) throw new Error(`setProfilePublic failed: ${res.status()} ${await res.text()}`)
}

export async function apiRequestConnection(
  request: APIRequestContext,
  token: string,
  addresseeUsername: string,
): Promise<{ id: string }> {
  const res = await request.post(`${API_URL}/api/v1/connections/request`, {
    headers: auth(token),
    data: { addresseeUsername },
  })
  if (!res.ok()) throw new Error(`requestConnection failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiAcceptConnection(
  request: APIRequestContext,
  token: string,
  connectionId: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/connections/${connectionId}/accept`, {
    headers: auth(token),
  })
  if (!res.ok()) throw new Error(`acceptConnection failed: ${res.status()} ${await res.text()}`)
}

export async function apiListConnections(
  request: APIRequestContext,
  token: string,
  status?: "pending" | "accepted",
): Promise<Array<{ id: string; status: string }>> {
  const url = `${API_URL}/api/v1/connections${status ? `?status=${status}` : ""}`
  const res = await request.get(url, { headers: auth(token) })
  if (!res.ok()) throw new Error(`listConnections failed: ${res.status()}`)
  return res.json()
}

export async function apiListBlocks(
  request: APIRequestContext,
  token: string,
): Promise<Array<{ id: string }>> {
  const res = await request.get(`${API_URL}/api/v1/blocks`, { headers: auth(token) })
  if (!res.ok()) throw new Error(`listBlocks failed: ${res.status()}`)
  return res.json()
}

// Make the connection graph for `token` a clean slate: remove every connection
// (either direction) and every block the caller owns. Safe to call repeatedly.
export async function apiClearGraph(request: APIRequestContext, token: string): Promise<void> {
  for (const conn of await apiListConnections(request, token)) {
    await request.delete(`${API_URL}/api/v1/connections/${conn.id}`, { headers: auth(token) })
  }
  for (const block of await apiListBlocks(request, token)) {
    await request.delete(`${API_URL}/api/v1/blocks/${block.id}`, { headers: auth(token) })
  }
}

// Establish an accepted buddy connection between two users via the API.
export async function apiMakeBuddies(
  request: APIRequestContext,
  requesterToken: string,
  addresseeToken: string,
  addresseeUsername: string,
): Promise<void> {
  const connection = await apiRequestConnection(request, requesterToken, addresseeUsername)
  await apiAcceptConnection(request, addresseeToken, connection.id)
}

export async function apiCreateLog(
  request: APIRequestContext,
  token: string,
  data: { tripId: string; date?: string; distance?: number; hours?: number },
): Promise<{ id: string }> {
  const res = await request.post(`${API_URL}/api/v1/log/create`, {
    headers: auth(token),
    data: { date: "2026-06-20", distance: 12, hours: 4, ...data },
  })
  if (!res.ok()) throw new Error(`createLog failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiDeleteLog(
  request: APIRequestContext,
  token: string,
  logId: string,
): Promise<void> {
  await request.delete(`${API_URL}/api/v1/log/${logId}`, { headers: auth(token) })
}

// Delete every log owned by the caller — keeps the "ask to endorse" affordance
// count deterministic across reruns (a failed run leaves its trip-linked log behind).
export async function apiClearLogs(request: APIRequestContext, token: string): Promise<void> {
  const res = await request.get(`${API_URL}/api/v1/log/all?per_page=100`, { headers: auth(token) })
  if (!res.ok()) return
  const body = await res.json()
  for (const log of body.items ?? []) {
    await request.delete(`${API_URL}/api/v1/log/${log.id}`, { headers: auth(token) })
  }
}
