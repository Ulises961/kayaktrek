import {
  ConnectionSchema,
  type Connection,
} from "@shared/dtos/connection"
import { PaddlerSearchPageSchema, type PaddlerSearchPage } from "@shared/dtos/paddler-search"

import { apiDelete, apiGet, apiPost } from "../api/client"

// Search public paddlers for the buddy finder (M7b). Unlike web's searchPaddlers
// (frontend/lib/connections/actions.ts), which swallows errors into an empty page for
// pages where search is incidental, this throws — mobile's paddlers screen is
// dedicated to this action, so a network failure should show the screen's own
// error/retry state, not a silent "no results" that looks identical to a real
// empty search.
export async function searchPaddlers(term: string, page = 1): Promise<PaddlerSearchPage> {
  const params = new URLSearchParams({ q: term, page: String(page) })
  const raw = await apiGet<unknown>(`/api/user/search/paddlers?${params}`)
  return PaddlerSearchPageSchema.parse(raw)
}

export type ConnectionStatusFilter = "pending" | "accepted"

// GET /api/v1/connections?status=pending|accepted — omitted status lists both.
export async function listConnections(status?: ConnectionStatusFilter): Promise<Connection[]> {
  const raw = await apiGet<unknown>(`/api/connections${status ? `?status=${status}` : ""}`)
  if (!Array.isArray(raw)) return []
  return raw.map((row) => ConnectionSchema.parse(row))
}

// Send a buddy request, targeting a paddler by username or id.
export async function requestConnection(target: {
  username?: string
  userId?: string
}): Promise<Connection> {
  const raw = await apiPost<unknown>("/api/connections/request", {
    addresseeUsername: target.username,
    addresseeId: target.userId,
  })
  return ConnectionSchema.parse(raw)
}

// Addressee-only; idempotent if already accepted.
export async function acceptConnection(connectionId: string): Promise<Connection> {
  const raw = await apiPost<unknown>(`/api/connections/${connectionId}/accept`, {})
  return ConnectionSchema.parse(raw)
}

// Covers both declining a pending request and unfriending an accepted one — either
// party may call this on a given connection.
export async function removeConnection(connectionId: string): Promise<void> {
  await apiDelete(`/api/connections/${connectionId}`)
}
