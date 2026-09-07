import {
  PersonalPackingItemSchema,
  type PersonalPackingItem,
} from "@shared/dtos/personal-packing"

import { apiDelete, apiGet, apiPatch, apiPost } from "../api/client"

// The caller's private per-trip packing list — never lent to the group,
// visible only to its owner (distinct from a requirement contribution).
export async function getPackingItems(tripId: string): Promise<PersonalPackingItem[]> {
  const raw = await apiGet<unknown>(`/api/packing/trip/${tripId}`)
  if (!Array.isArray(raw)) return []
  return raw.map((row) => PersonalPackingItemSchema.parse(row))
}

export async function addPackingItem(tripId: string, itemId: string): Promise<PersonalPackingItem> {
  const raw = await apiPost<unknown>("/api/packing/create", { tripId, itemId })
  return PersonalPackingItemSchema.parse(raw)
}

export async function togglePackingItem(
  entryId: string,
  checked: boolean,
): Promise<PersonalPackingItem> {
  const raw = await apiPatch<unknown>(`/api/packing/${entryId}`, { checked })
  return PersonalPackingItemSchema.parse(raw)
}

export async function removePackingItem(entryId: string): Promise<void> {
  await apiDelete(`/api/packing/${entryId}`)
}
