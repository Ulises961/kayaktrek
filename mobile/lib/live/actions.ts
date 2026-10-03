import { z } from "zod"

import { apiPost } from "../api/client"
import { API_PREFIX, SSE_URL } from "../api/config"

const ChangesTicketSchema = z.object({ ticket: z.string().min(1) })

// Mints a trip-changes ticket (M36) and returns the sidecar URL for the crew-only change
// stream. A ticket, not the bearer token, because it goes through `apiPost` — which
// refreshes an expired access token — while the stream itself outlives any access token.
export async function getChangesStreamUrl(tripId: string): Promise<string> {
  const { ticket } = ChangesTicketSchema.parse(
    await apiPost<unknown>(`/api/live/trip/${tripId}/changes-ticket`, {}),
  )
  return `${SSE_URL}${API_PREFIX}/live/trip/${tripId}/changes?ticket=${ticket}`
}
