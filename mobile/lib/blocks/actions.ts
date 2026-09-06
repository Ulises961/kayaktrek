import { BlockSchema, type Block } from "@shared/dtos/block"

import { apiDelete, apiGet, apiPost } from "../api/client"

export async function listBlocks(): Promise<Block[]> {
  const raw = await apiGet<unknown>("/api/blocks")
  if (!Array.isArray(raw)) return []
  return raw.map((row) => BlockSchema.parse(row))
}

// Blocking tears down any existing connection server-side as a hard reset — the
// caller doesn't need to remove a connection first.
export async function blockPaddler(target: {
  username?: string
  userId?: string
}): Promise<Block> {
  const raw = await apiPost<unknown>("/api/blocks", {
    blockedUsername: target.username,
    blockedId: target.userId,
  })
  return BlockSchema.parse(raw)
}

// Unblocking does not restore the previous connection — the paddler must re-request.
export async function unblockPaddler(blockId: string): Promise<void> {
  await apiDelete(`/api/blocks/${blockId}`)
}
