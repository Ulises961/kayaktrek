import { APIRequestContext } from "@playwright/test"
import { API_URL } from "../playwright.config"

// API helpers for inventory / requirements / personal packing. Specs use these to
// set up state quickly and drive only the assertion-critical path through the UI.

export interface ItemResponse {
  id: string
  name: string
  status: string
}

export async function apiCreateItem(
  request: APIRequestContext,
  token: string,
  opts: { name: string; status?: "owned" | "suggested" },
): Promise<ItemResponse> {
  const res = await request.post(`${API_URL}/api/item/create`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: opts.name, status: opts.status ?? "owned" },
  })
  if (!res.ok()) throw new Error(`createItem failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export interface RequirementSummary {
  id: string
  name: string
  status: string
}

export interface TripInventory {
  inventoryId: string
  requirements: RequirementSummary[]
}

interface RawTrip {
  inventory?: {
    id: string
    requirements?: { id: string; name: string; status: string }[]
  }
}

/** Reads the trip and projects out its inventory id + seeded requirements. */
export async function apiGetInventory(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<TripInventory> {
  const res = await request.get(`${API_URL}/api/trip/${tripId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) throw new Error(`getTrip failed: ${res.status()} ${await res.text()}`)
  const trip = (await res.json()) as RawTrip
  const inv = trip.inventory
  if (!inv) throw new Error("trip has no inventory")
  return {
    inventoryId: inv.id,
    requirements: (inv.requirements ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
    })),
  }
}

export function findRequirementId(inv: TripInventory, name: string): string {
  const req = inv.requirements.find((r) => r.name === name)
  if (!req) {
    const names = inv.requirements.map((r) => r.name).join(", ")
    throw new Error(`requirement "${name}" not found among: ${names}`)
  }
  return req.id
}

export async function apiAddRequirement(
  request: APIRequestContext,
  token: string,
  inventoryId: string,
  opts: { name: string; category?: string },
): Promise<{ id: string; name: string }> {
  const res = await request.post(`${API_URL}/api/inventory/${inventoryId}/requirements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: opts.name, category: opts.category },
  })
  if (!res.ok()) throw new Error(`addRequirement failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

export async function apiContribute(
  request: APIRequestContext,
  token: string,
  inventoryId: string,
  reqId: string,
  itemId: string,
): Promise<void> {
  const res = await request.post(
    `${API_URL}/api/inventory/${inventoryId}/requirements/${reqId}/contribute`,
    { headers: { Authorization: `Bearer ${token}` }, data: { itemId } },
  )
  if (!res.ok()) throw new Error(`contribute failed: ${res.status()} ${await res.text()}`)
}

export async function apiAddPacking(
  request: APIRequestContext,
  token: string,
  tripId: string,
  itemId: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/packing/create`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { tripId, itemId },
  })
  if (!res.ok()) throw new Error(`addPacking failed: ${res.status()} ${await res.text()}`)
}
