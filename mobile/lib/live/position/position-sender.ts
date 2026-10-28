import { ApiError, OFFLINE_ERROR_MESSAGE, SessionExpiredError, apiPost } from "../../api/client"
import { SEND_FAILURE, STOP_REASON, type PositionFix, type SendOutcome } from "./types"

// One ping to `POST /live/trip/<id>/position`. Never throws: the caller is a background task with
// nobody to show an error to, so every way it can go wrong becomes an outcome the task acts on and
// the evidence log records. A failed send is not queued; the next fix retries (the queue is WP5).
export async function sendPositionPing(tripId: string, fix: PositionFix): Promise<SendOutcome> {
  try {
    await apiPost<unknown>(`/api/live/trip/${tripId}/position`, {
      lat: fix.lat,
      lon: fix.lon,
      ...(fix.accuracyM !== null && { accuracyM: fix.accuracyM }),
      ...(fix.headingDeg !== null && { headingDeg: fix.headingDeg }),
      ...(fix.speedMs !== null && { speedMs: fix.speedMs }),
      recordedAt: new Date(fix.timestamp).toISOString(),
    })
    return { kind: "sent" }
  } catch (error) {
    if (error instanceof ApiError) {
      // 409: the trip is not happening (or paused). The share is over, not failing.
      if (error.status === 409) return { kind: "stop", reason: STOP_REASON.TRIP_NOT_LIVE }
      if (error.status === 403 || error.status === 404) return { kind: "stop", reason: STOP_REASON.NOT_ON_TRIP }
      if (error.status === 429) return { kind: "retry", reason: SEND_FAILURE.RATE_LIMITED }
      if (error.status >= 500) return { kind: "retry", reason: SEND_FAILURE.SERVER }
      return { kind: "retry", reason: SEND_FAILURE.REJECTED }
    }
    // refreshSession has already told the app the session ended; the share stays on so that signing
    // in again resumes it, and the status says why nothing is getting through.
    if (error instanceof SessionExpiredError) return { kind: "retry", reason: SEND_FAILURE.SESSION }
    if (error instanceof Error && error.message === OFFLINE_ERROR_MESSAGE) {
      return { kind: "retry", reason: SEND_FAILURE.OFFLINE }
    }
    return { kind: "retry", reason: SEND_FAILURE.SERVER }
  }
}
