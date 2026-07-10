"use server"

import { revalidatePath } from "next/cache"
import { apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import type { ItemStatus } from "@/lib/dtos/item"

export type InventoryActionResult = { success: true } | { success: false; error: string }

export interface CreateItemInput {
  name: string
  categoryId?: string
  status?: ItemStatus
}

// Creates a personal gear item. Requires only auth — items are not tied to an
// inventory (a user's gear closet is all their items).
export async function createItem(input: CreateItemInput): Promise<InventoryActionResult> {
  try {
    await apiPost("/api/item/create", {
      name: input.name,
      categoryId: input.categoryId,
      status: input.status,
    })
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to add gear." }
  }
}

// Promotes a suggested item to owned — the ownership confirmation step.
export async function confirmItemOwned(itemId: string): Promise<InventoryActionResult> {
  try {
    await apiPatch(`/api/item/${itemId}`, { status: "owned" })
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to confirm gear." }
  }
}

// Toggles the packing-checked flag on an item.
export async function toggleItem(itemId: string, checked: boolean): Promise<InventoryActionResult> {
  try {
    await apiPatch(`/api/item/${itemId}`, { checked })
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update gear." }
  }
}

// Toggles cross-trip packing intent: does this item auto-suggest onto future
// trips' private packing lists? Checking a custom item opts it in; clearing a
// catalog-seeded item means "don't suggest again".
export async function toggleDefaultPack(
  itemId: string,
  defaultPack: boolean,
): Promise<InventoryActionResult> {
  try {
    await apiPatch(`/api/item/${itemId}`, { defaultPack })
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update gear." }
  }
}

export async function deleteItem(itemId: string): Promise<InventoryActionResult> {
  try {
    await apiDelete(`/api/item/${itemId}`)
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete gear." }
  }
}

export interface AddRequirementInput {
  name: string
  category?: string
}

// Adds a requirement slot to a trip inventory. Any trip member may manage
// requirements (backend gates on inventory ownership = trip membership).
export async function addRequirement(
  inventoryId: string,
  input: AddRequirementInput,
  tripId?: string,
): Promise<InventoryActionResult> {
  try {
    await apiPost(`/api/inventory/${inventoryId}/requirements`, {
      name: input.name,
      category: input.category,
    })
    if (tripId) revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to add requirement.",
    }
  }
}

export async function removeRequirement(
  inventoryId: string,
  reqId: string,
  tripId?: string,
): Promise<InventoryActionResult> {
  try {
    await apiDelete(`/api/inventory/${inventoryId}/requirements/${reqId}`)
    if (tripId) revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to remove requirement.",
    }
  }
}

// Covers a requirement with one of the caller's owned personal items.
export async function contributeItem(
  inventoryId: string,
  reqId: string,
  itemId: string,
  tripId?: string,
): Promise<InventoryActionResult> {
  try {
    await apiPost(`/api/inventory/${inventoryId}/requirements/${reqId}/contribute`, { itemId })
    if (tripId) revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to contribute item.",
    }
  }
}

export async function unclaimRequirement(
  inventoryId: string,
  reqId: string,
  tripId?: string,
): Promise<InventoryActionResult> {
  try {
    await apiDelete(`/api/inventory/${inventoryId}/requirements/${reqId}/contribute`)
    if (tripId) revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to withdraw contribution.",
    }
  }
}
