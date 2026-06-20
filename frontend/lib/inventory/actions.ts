"use server"

import { revalidatePath } from "next/cache"
import { apiPost, isRedirectError } from "@/lib/api/client"
import type { ItemStatus } from "@/lib/dtos/item"

export type InventoryActionResult =
  | { success: true }
  | { success: false; error: string }

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
