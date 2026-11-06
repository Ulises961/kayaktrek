import { z } from "zod"
import { ApiError, apiPost } from "../api/client"
import { API_PREFIX, SSE_URL } from "../api/config"

const ChangesTicketSchema = z.object({ ticket: z.string().min(1) })

// Mints a trip-changes ticket (M36). A ticket, not the bearer token, because it goes through
// `apiPost` — which refreshes an expired access token — and the poll then needs no refresh logic
// of its own. The same ticket opens every poll on the sidecar that is keyed on a member of the trip.
//
// `null` means the server said no — not on the trip. Anything else that goes wrong throws:
// the poller must not take a backend that is down, or a phone with no signal, for a removal.
async function mintPollTicket(tripId: string): Promise<string | null> {
  try {
    const { ticket } = ChangesTicketSchema.parse(
      await apiPost<unknown>(`/api/live/trip/${tripId}/changes-ticket`, {}),
    )
    return ticket
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null
    throw error
  }
}

// The sidecar URL to poll for the crew's changes.
export async function getChangesPollUrl(tripId: string): Promise<string | null> {
  const ticket = await mintPollTicket(tripId)
  return ticket === null ? null : `${SSE_URL}${API_PREFIX}/live/trip/${tripId}/changes?ticket=${ticket}`
}

// The sidecar URL to poll for the crew's newest positions (M9e WP2).
export async function getPositionsPollUrl(tripId: string): Promise<string | null> {
  const ticket = await mintPollTicket(tripId)
  return ticket === null ? null : `${SSE_URL}${API_PREFIX}/live/trip/${tripId}/positions?ticket=${ticket}`
}
