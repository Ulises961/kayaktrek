import { ItemSchema, type Item } from "@shared/dtos/item"
import { TripRequirementSchema, type TripRequirement } from "@shared/dtos/inventory"

import { apiDelete, apiGet, apiPost } from "../api/client"

// A user's gear closet — items are personal, never tied to an inventory
// (backend/Resources/item_resource.py). Used to populate the "cover this
// requirement with one of your owned items" picker.
export async function getMyItems(): Promise<Item[]> {
  const raw = await apiGet<unknown>("/api/item/all")
  if (!Array.isArray(raw)) return []
  return raw.map((row) => ItemSchema.parse(row))
}

export async function addRequirement(
  inventoryId: string,
  fields: { name: string; category?: string },
): Promise<TripRequirement> {
  const raw = await apiPost<unknown>(`/api/inventory/${inventoryId}/requirements`, {
    name: fields.name,
    category: fields.category,
  })
  return TripRequirementSchema.parse(raw)
}

// Delete-rule collapses to "you may remove only what you proposed" (M6b) —
// enforced server-side; the screen just surfaces the 403 if it doesn't hold.
export async function removeRequirement(inventoryId: string, requirementId: string): Promise<void> {
  await apiDelete(`/api/inventory/${inventoryId}/requirements/${requirementId}`)
}

// Covers a requirement with one of the caller's owned items. Several members
// may each cover the same requirement; each contributes at most once.
export async function contributeItem(
  inventoryId: string,
  requirementId: string,
  itemId: string,
): Promise<TripRequirement> {
  const raw = await apiPost<unknown>(
    `/api/inventory/${inventoryId}/requirements/${requirementId}/contribute`,
    { itemId },
  )
  return TripRequirementSchema.parse(raw)
}

// Removes the caller's own contribution only — never another member's.
export async function unclaimRequirement(
  inventoryId: string,
  requirementId: string,
): Promise<void> {
  await apiDelete(`/api/inventory/${inventoryId}/requirements/${requirementId}/contribute`)
}
