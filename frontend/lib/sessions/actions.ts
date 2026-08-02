"use server"

import { revalidatePath } from "next/cache"
import { apiDelete, apiGet, isRedirectError } from "@/lib/api/client"
import { SessionsSchema } from "@/lib/dtos/session"
import type { Session } from "@/lib/dtos/session"

const SESSIONS_PATH = "/api/sessions"

export type SessionActionResult = { success: true } | { success: false; error: string }
export type SessionListResult =
  | { success: true; sessions: Session[] }
  | { success: false; error: string }

export async function listSessions(): Promise<SessionListResult> {
  try {
    const raw = await apiGet<unknown>(`${SESSIONS_PATH}/all`)
    return { success: true, sessions: SessionsSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to load your devices." }
  }
}

export async function revokeSession(sessionId: string): Promise<SessionActionResult> {
  try {
    await apiDelete(`${SESSIONS_PATH}/${sessionId}`)
    revalidatePath("/settings")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Could not sign out that device." }
  }
}
