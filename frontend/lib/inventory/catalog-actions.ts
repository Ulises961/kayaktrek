"use server"

import { revalidatePath } from "next/cache"
import { apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import type { InventoryActionResult } from "@/lib/inventory/actions"

export interface CreateCatalogItemInput {
  name: string
  categoryId?: string
}

// Adds an item to the caller's shared-requirement template (a personal
// CatalogItem, not trip-scoped — reused across every trip the owner creates).
export async function createCatalogItem(
  input: CreateCatalogItemInput,
): Promise<InventoryActionResult> {
  try {
    await apiPost("/api/catalog-item/create", { name: input.name, categoryId: input.categoryId })
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to add to your default trip kit.",
    }
  }
}

export async function deleteCatalogItem(catalogItemId: string): Promise<InventoryActionResult> {
  try {
    await apiDelete(`/api/catalog-item/${catalogItemId}`)
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to remove from your default trip kit.",
    }
  }
}

// Bootstraps the caller's empty template from the hardcoded default list —
// the on-ramp so a curator starts from a known-good set and prunes/extends it.
export async function resetCatalogToDefault(): Promise<InventoryActionResult> {
  try {
    await apiPost("/api/catalog-item/reset-to-default", {})
    revalidatePath("/gear")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to start from the default list.",
    }
  }
}
