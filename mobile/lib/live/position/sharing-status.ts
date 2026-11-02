import { SEND_FAILURE, STOP_REASON, type SendFailure, type SharingRecord } from "./types"

// What the paddler is told about their share. A fact that could not be read is `null` and never
// reported as a problem: the status must not cry wolf, and must not hide a real one either.
export type SharingFacts = {
  record: SharingRecord | null
  // The app's location permission.
  permissionGranted: boolean | null
  // The system location switch, which the permission does not reflect.
  locationServicesOn: boolean | null
  taskRunning: boolean | null
  now: number
}

export type SharingStatus =
  | { kind: "off" }
  | { kind: "ended"; reason: typeof STOP_REASON.TRIP_NOT_LIVE | typeof STOP_REASON.NOT_ON_TRIP }
  | { kind: "needs-permission" }
  | { kind: "location-off" }
  | { kind: "not-running" }
  | { kind: "starting" }
  | { kind: "failing"; reason: SendFailure; since: number; lastSentAt: number | null }
  | { kind: "sharing"; lastSentAt: number }

export function sharingStatus(facts: SharingFacts): SharingStatus {
  const { record } = facts
  if (record === null) return { kind: "off" }
  if (record.endedReason !== null) return { kind: "ended", reason: record.endedReason }
  if (facts.permissionGranted === false) return { kind: "needs-permission" }
  if (facts.locationServicesOn === false) return { kind: "location-off" }
  if (facts.taskRunning === false) return { kind: "not-running" }
  const { lastFailure, lastSentAt } = record
  if (lastFailure !== null && (lastSentAt === null || lastFailure.at > lastSentAt)) {
    return { kind: "failing", reason: lastFailure.reason, since: lastFailure.at, lastSentAt }
  }
  if (lastSentAt === null) return { kind: "starting" }
  return { kind: "sharing", lastSentAt }
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`
}

const FAILURE_TEXT: Record<SendFailure, string> = {
  [SEND_FAILURE.OFFLINE]: "no connection",
  [SEND_FAILURE.RATE_LIMITED]: "too many requests",
  [SEND_FAILURE.REJECTED]: "the server refused it",
  [SEND_FAILURE.SERVER]: "the server had a problem",
  [SEND_FAILURE.SESSION]: "you need to sign in again",
}

export function describeStatus(status: SharingStatus, now: number): string {
  switch (status.kind) {
    case "off":
      return "Not sharing."
    case "ended":
      return status.reason === STOP_REASON.TRIP_NOT_LIVE
        ? "Sharing ended: the trip is no longer under way."
        : "Sharing ended: you are no longer on this trip."
    case "needs-permission":
      return "Location permission is off for this app, so nothing is being shared."
    case "location-off":
      return "Location is switched off on this phone, so nothing is being shared. Switch it on from the quick settings."
    case "not-running":
      return "Sharing is on but the location service is not running. Stop and start it again."
    case "starting":
      return "Sharing is on. Waiting for the first position."
    case "failing": {
      const last =
        status.lastSentAt === null ? "Nothing has been sent yet." : `Last sent ${formatAge(now - status.lastSentAt)}.`
      return `Sharing is on, but the last position could not be sent (${FAILURE_TEXT[status.reason]}). ${last}`
    }
    case "sharing":
      return `Sharing is on. Last sent ${formatAge(now - status.lastSentAt)}.`
  }
}
