"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import { ConnectionSchema } from "@/lib/dtos/connection"
import { PaddlerSearchPageSchema } from "@/lib/dtos/paddler-search"
import type { Connection, Relationship } from "@/lib/dtos/connection"
import type { PaddlerSearchPage } from "@/lib/dtos/paddler-search"

export type ConnectionActionResult = { success: true } | { success: false; error: string }

// Buddy connection status filter — omitted means all of the caller's connections.
export type ConnectionStatusFilter = "pending" | "accepted"

// Search public paddlers for the buddy finder. An empty term yields an empty page
// (the backend never returns the whole directory).
export async function searchPaddlers(term: string, page = 1): Promise<PaddlerSearchPage> {
  const params = new URLSearchParams({ q: term, page: String(page) })
  try {
    const raw = await apiGet(`/api/user/search/paddlers?${params}`)
    return PaddlerSearchPageSchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { items: [], total: 0, page, pages: 1 }
  }
}

// The caller's relationship to a single paddler, resolved via the search endpoint
// (public-only, block-filtered, self-excluded). Returns null when there is no
// actionable relationship surface — i.e. the paddler is the caller, private,
// blocked either way, or not found — so the profile renders no controls.
export async function getRelationship(
  username: string,
): Promise<{ relationship: Relationship; connectionId?: string | null; userId: string } | null> {
  try {
    const page = await searchPaddlers(username)
    const match = page.items.find((p) => p.username === username)
    if (!match) return null
    return { relationship: match.relationship, connectionId: match.connectionId, userId: match.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return null
  }
}

// List the caller's connections (buddies and/or pending), optionally filtered.
export async function listConnections(status?: ConnectionStatusFilter): Promise<Connection[]> {
  try {
    const raw = await apiGet<unknown>(`/api/connections${status ? `?status=${status}` : ""}`)
    if (!Array.isArray(raw)) return []
    return raw.map((row) => ConnectionSchema.parse(row))
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

// Send a buddy request, targeting a paddler by username or id.
export async function requestConnection(target: {
  username?: string
  userId?: string
}): Promise<ConnectionActionResult> {
  try {
    await apiPost("/api/connections/request", {
      addresseeUsername: target.username,
      addresseeId: target.userId,
    })
    revalidatePath("/paddlers")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("409"))
      return { success: false, error: "You already have a connection with this paddler." }
    if (msg.includes("404")) return { success: false, error: "That paddler could not be found." }
    return { success: false, error: "Failed to send buddy request." }
  }
}

// Accept an incoming pending request (addressee only). Now buddies.
export async function acceptConnection(connectionId: string): Promise<ConnectionActionResult> {
  try {
    await apiPost(`/api/connections/${connectionId}/accept`, {})
    revalidatePath("/paddlers")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to accept buddy request." }
  }
}

// Remove a connection — covers declining a pending request and unfriending a buddy.
export async function removeConnection(connectionId: string): Promise<ConnectionActionResult> {
  try {
    await apiDelete(`/api/connections/${connectionId}`)
    revalidatePath("/paddlers")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to remove connection." }
  }
}
