import { SessionsSchema } from "@shared/dtos/session"
import type { Session } from "@shared/dtos/session"

import { apiDelete, apiGet } from "@mobile/lib/api/client"

const SESSIONS_PATH = "/api/sessions"

// M17's per-device sessions. Read-only apart from revocation: a session is created by
// signing in and ended by revoking it, never edited.
export async function listSessions(): Promise<Session[]> {
  const raw = await apiGet<unknown>(`${SESSIONS_PATH}/all`)
  return SessionsSchema.parse(raw)
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiDelete(`${SESSIONS_PATH}/${sessionId}`)
}
