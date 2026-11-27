import { z } from "zod"

// The location task's name, in expo-task-manager's registry.
export const POSITION_TASK = "kayaktrek-position"

// What a share is for: the trip whose crew sees the position.
export const SharingTargetSchema = z.object({ kind: z.literal("trip"), tripId: z.string().min(1) })
export type SharingTarget = z.infer<typeof SharingTargetSchema>

// Why a share ended without the paddler pressing Stop.
export const STOP_REASON = {
  USER: "user",
  TRIP_NOT_LIVE: "trip-not-live",
  NOT_ON_TRIP: "not-on-trip",
} as const
export type StopReason = (typeof STOP_REASON)[keyof typeof STOP_REASON]

export const SEND_FAILURE = {
  OFFLINE: "offline",
  RATE_LIMITED: "rate-limited",
  REJECTED: "rejected",
  SERVER: "server",
  SESSION: "session",
} as const
export type SendFailure = (typeof SEND_FAILURE)[keyof typeof SEND_FAILURE]

// The persisted record of a share: enough for a process that has just been restarted, or a
// background task running in a fresh one, to know what it is sharing and when it last managed to.
// It holds no coordinates, only times.
export const SharingRecordSchema = z.object({
  target: SharingTargetSchema,
  startedAt: z.number(),
  lastSentAt: z.number().nullable(),
  lastFixAt: z.number().nullable(),
  lastWakeAt: z.number().nullable(),
  lastFailure: z
    .object({ at: z.number(), reason: z.enum(Object.values(SEND_FAILURE) as [SendFailure, ...SendFailure[]]) })
    .nullable(),
  // Set when the share ended by itself. Cleared by starting again.
  endedReason: z.enum([STOP_REASON.TRIP_NOT_LIVE, STOP_REASON.NOT_ON_TRIP]).nullable(),
})
export type SharingRecord = z.infer<typeof SharingRecordSchema>

export type PositionFix = {
  lat: number
  lon: number
  accuracyM: number | null
  headingDeg: number | null
  speedMs: number | null
  // The fix's own time, ms since the epoch.
  timestamp: number
}

export type SendOutcome =
  | { kind: "sent" }
  | { kind: "stop"; reason: typeof STOP_REASON.TRIP_NOT_LIVE | typeof STOP_REASON.NOT_ON_TRIP }
  | { kind: "retry"; reason: SendFailure }
