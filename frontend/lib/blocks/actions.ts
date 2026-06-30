"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import { BlockSchema } from "@/lib/dtos/block"
import type { Block } from "@/lib/dtos/block"

export type BlockActionResult = { success: true } | { success: false; error: string }

// List the caller's blocked paddlers (the manage screen).
export async function listBlocks(): Promise<Block[]> {
  try {
    const raw = await apiGet<unknown>("/api/blocks")
    if (!Array.isArray(raw)) return []
    return raw.map((row) => BlockSchema.parse(row))
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

// Block a paddler by username or id. The backend tears down any connection and
// revokes pending invitations between the two as a hard reset.
export async function blockPaddler(target: {
  username?: string
  userId?: string
}): Promise<BlockActionResult> {
  try {
    await apiPost("/api/blocks", {
      blockedUsername: target.username,
      blockedId: target.userId,
    })
    revalidatePath("/paddlers")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("409"))
      return { success: false, error: "You have already blocked this paddler." }
    if (msg.includes("404")) return { success: false, error: "That paddler could not be found." }
    return { success: false, error: "Failed to block paddler." }
  }
}

// Unblock — does not restore the previous connection; the paddler must re-request.
export async function unblockPaddler(blockId: string): Promise<BlockActionResult> {
  try {
    await apiDelete(`/api/blocks/${blockId}`)
    revalidatePath("/paddlers")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to unblock paddler." }
  }
}
