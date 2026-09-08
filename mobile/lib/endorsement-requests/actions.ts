import { EndorsementRequestSchema, type EndorsementRequest } from "@shared/dtos/endorsement-request"

import { apiDelete, apiGet } from "../api/client"

export type RequestDirection = "incoming" | "outgoing"

// "incoming" = requests asking the caller to endorse someone else's log (the
// inbox WP1 surfaces on the logs screen); "outgoing" is not built yet — it needs
// a paddler picker, which is M9i's WP2 (buddy connections).
export async function listEndorsementRequests(
  direction: RequestDirection = "incoming",
): Promise<EndorsementRequest[]> {
  const raw = await apiGet<unknown>(`/api/endorsement-requests?direction=${direction}`)
  if (!Array.isArray(raw)) return []
  return raw.map((row) => EndorsementRequestSchema.parse(row))
}

// Author cancels, or addressee declines — deletes the request (re-requestable).
export async function deleteEndorsementRequest(requestId: string): Promise<void> {
  await apiDelete(`/api/endorsement-requests/${requestId}`)
}
