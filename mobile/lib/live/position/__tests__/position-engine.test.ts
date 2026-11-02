import * as BackgroundTask from "expo-background-task"
import * as Location from "expo-location"

import type { SpikeEvent } from "../../../spike/run-report"
import {
  POSITION_TASK,
  SharingStartError,
  deliver,
  ensureRunning,
  handleFixes,
  resetEngineForTests,
  startSharing,
  stopSharing,
  type EngineDeps,
} from "../position-engine"
import { getSharingRecord, setSharingRecord } from "../sharing-state"
import { SEND_FAILURE, STOP_REASON, type PositionFix, type SharingRecord } from "../types"
import { WATCHDOG_TASK } from "../watchdog-schedule"

jest.mock("../sharing-state", () => {
  let record: Record<string, unknown> | null = null
  return {
    getSharingRecord: () => record,
    setSharingRecord: (next: Record<string, unknown> | null) => {
      record = next
    },
    updateSharingRecord: (patch: Record<string, unknown>) => {
      if (record === null) return null
      record = { ...record, ...patch }
      return record
    },
  }
})

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}))

jest.mock("expo-background-task", () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}))

const location = jest.mocked(Location)
const backgroundTask = jest.mocked(BackgroundTask)

const T0 = Date.UTC(2026, 9, 28, 12, 0, 0)

function fix(overrides: Partial<PositionFix> = {}): PositionFix {
  return { lat: 46.0, lon: 11.0, accuracyM: 10, headingDeg: null, speedMs: 0, timestamp: T0, ...overrides }
}

// 0.0002 degrees of latitude is about 22 m.
const TWENTY_TWO_METRES_NORTH = { lat: 46.0002, lon: 11.0 }

function location_(f: PositionFix): Location.LocationObject {
  return {
    timestamp: f.timestamp,
    coords: {
      latitude: f.lat,
      longitude: f.lon,
      accuracy: f.accuracyM,
      speed: f.speedMs,
      heading: f.headingDeg ?? -1,
      altitude: null,
      altitudeAccuracy: null,
    },
  }
}

let clock: number
let events: SpikeEvent[]
let send: jest.Mock
let deps: EngineDeps

function startRecord(overrides: Partial<SharingRecord> = {}): void {
  setSharingRecord({
    target: { kind: "trip", tripId: "trip-1" },
    startedAt: T0,
    lastSentAt: null,
    lastFixAt: null,
    lastWakeAt: null,
    lastFailure: null,
    endedReason: null,
    ...overrides,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  setSharingRecord(null)
  resetEngineForTests()
  clock = T0
  events = []
  send = jest.fn().mockResolvedValue({ kind: "sent" })
  deps = { now: () => clock, send, log: (event) => events.push(event) }
  location.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as never)
  location.hasServicesEnabledAsync.mockResolvedValue(true)
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(true)
  location.startLocationUpdatesAsync.mockResolvedValue(undefined)
  location.stopLocationUpdatesAsync.mockResolvedValue(undefined)
})

const eventsOf = <K extends SpikeEvent["ev"]>(kind: K) =>
  events.filter((event): event is Extract<SpikeEvent, { ev: K }> => event.ev === kind)

describe("handleFixes", () => {
  it("writes every fix to the evidence log, whether or not it is sent", async () => {
    startRecord()
    await handleFixes([location_(fix()), location_(fix({ timestamp: T0 + 1_000 }))], deps)
    expect(eventsOf("fix")).toHaveLength(2)
    expect(eventsOf("fix")[0]).toMatchObject({ lat: 46.0, lon: 11.0, accuracyM: 10, speedMs: 0 })
  })

  it("sends the first fix and records when it went out", async () => {
    startRecord()
    await handleFixes([location_(fix())], deps)
    expect(send).toHaveBeenCalledWith("trip-1", expect.objectContaining({ lat: 46.0, lon: 11.0 }))
    expect(getSharingRecord()).toMatchObject({ lastSentAt: T0, lastFixAt: T0, lastFailure: null })
    expect(eventsOf("ping")).toEqual([{ ev: "ping", t: T0, source: "movement", outcome: "sent", detail: null }])
  })

  it("holds back a fix inside the throttle window and one that has not moved", async () => {
    startRecord()
    await handleFixes([location_(fix())], deps)
    clock = T0 + 5_000
    await handleFixes([location_(fix({ ...TWENTY_TWO_METRES_NORTH }))], deps)
    clock = T0 + 20_000
    await handleFixes([location_(fix())], deps)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("sends again once the phone is both late enough and far enough", async () => {
    startRecord()
    await handleFixes([location_(fix())], deps)
    clock = T0 + 20_000
    await handleFixes([location_(fix({ ...TWENTY_TWO_METRES_NORTH }))], deps)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("records a failed send and offers the very next fix again, since nothing was sent", async () => {
    startRecord()
    send.mockResolvedValueOnce({ kind: "retry", reason: SEND_FAILURE.OFFLINE })
    await handleFixes([location_(fix())], deps)
    expect(getSharingRecord()).toMatchObject({ lastSentAt: null, lastFailure: { at: T0, reason: SEND_FAILURE.OFFLINE } })
    expect(eventsOf("ping")[0]).toMatchObject({ outcome: "retry", detail: SEND_FAILURE.OFFLINE })
    clock = T0 + 1_000
    await handleFixes([location_(fix({ timestamp: T0 + 1_000 }))], deps)
    expect(send).toHaveBeenCalledTimes(2)
    expect(getSharingRecord()).toMatchObject({ lastSentAt: T0 + 1_000, lastFailure: null })
  })

  it("ends the share and stops the service when the trip is no longer happening", async () => {
    startRecord()
    send.mockResolvedValueOnce({ kind: "stop", reason: STOP_REASON.TRIP_NOT_LIVE })
    await handleFixes([location_(fix())], deps)
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(POSITION_TASK)
    expect(backgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(WATCHDOG_TASK)
    expect(getSharingRecord()).toMatchObject({ endedReason: STOP_REASON.TRIP_NOT_LIVE })
    expect(eventsOf("run-stop")[0]).toMatchObject({ reason: STOP_REASON.TRIP_NOT_LIVE })
  })

  it("sends nothing in a practice share, but counts the ping as sent so the keep-alive logic runs", async () => {
    startRecord({ target: { kind: "practice" } })
    await handleFixes([location_(fix())], deps)
    expect(send).not.toHaveBeenCalled()
    expect(getSharingRecord()).toMatchObject({ lastSentAt: T0 })
    expect(eventsOf("ping")[0]).toMatchObject({ outcome: "practice" })
  })

  it("stops a task that is registered with nothing to share", async () => {
    await handleFixes([location_(fix())], deps)
    expect(send).not.toHaveBeenCalled()
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(POSITION_TASK)
    expect(eventsOf("error")[0].message).toMatch(/no sharing record/)
  })

  it("maps Android's -1 for a missing speed or heading to null", async () => {
    startRecord()
    await handleFixes([location_(fix({ speedMs: -1, headingDeg: null }))], deps)
    expect(send).toHaveBeenCalledWith("trip-1", expect.objectContaining({ speedMs: null, headingDeg: null }))
  })
})

describe("deliver", () => {
  it("does nothing when there is no share to deliver to", async () => {
    expect(await deliver(fix(), "keep-alive", deps)).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it("marks a keep-alive ping in the evidence log", async () => {
    startRecord()
    await deliver(fix(), "keep-alive", deps)
    expect(eventsOf("ping")[0]).toMatchObject({ source: "keep-alive", outcome: "sent" })
  })
})

describe("startSharing", () => {
  it("refuses, and says why, when the app has no location permission", async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" } as never)
    await expect(startSharing({ kind: "trip", tripId: "trip-1" }, deps)).rejects.toMatchObject({
      reason: "permission",
    })
    expect(getSharingRecord()).toBeNull()
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled()
  })

  it("refuses, and says why, when the system location switch is off", async () => {
    location.hasServicesEnabledAsync.mockResolvedValue(false)
    const attempt = startSharing({ kind: "trip", tripId: "trip-1" }, deps)
    await expect(attempt).rejects.toBeInstanceOf(SharingStartError)
    await expect(attempt).rejects.toMatchObject({ reason: "location-off" })
    expect(getSharingRecord()).toBeNull()
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled()
  })

  it("starts the foreground service that outlives the app being swiped away, and the watchdog", async () => {
    await startSharing({ kind: "trip", tripId: "trip-1" }, deps)
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      POSITION_TASK,
      expect.objectContaining({
        timeInterval: 15_000,
        distanceInterval: 10,
        foregroundService: expect.objectContaining({ killServiceOnDestroy: false }),
      }),
    )
    expect(backgroundTask.registerTaskAsync).toHaveBeenCalledWith(WATCHDOG_TASK, { minimumInterval: 60 })
    expect(getSharingRecord()).toMatchObject({ target: { kind: "trip", tripId: "trip-1" }, startedAt: T0, endedReason: null })
    expect(eventsOf("run-start")[0].label).toMatch(/trip/i)
  })

  it("labels a practice share so the report tells it from a real one", async () => {
    await startSharing({ kind: "practice" }, deps)
    expect(eventsOf("run-start")[0].label).toMatch(/practice/i)
  })

  it("clears the share and rethrows when the service will not start", async () => {
    location.startLocationUpdatesAsync.mockRejectedValue(new Error("no foreground service"))
    await expect(startSharing({ kind: "trip", tripId: "trip-1" }, deps)).rejects.toMatchObject({
      reason: "start-failed",
    })
    expect(getSharingRecord()).toBeNull()
    expect(eventsOf("error")[0].message).toMatch(/no foreground service/)
  })
})

describe("stopSharing", () => {
  it("clears the record when the paddler stops", async () => {
    startRecord()
    await stopSharing(STOP_REASON.USER, deps)
    expect(getSharingRecord()).toBeNull()
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(POSITION_TASK)
    expect(backgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(WATCHDOG_TASK)
    expect(eventsOf("run-stop")[0]).toMatchObject({ reason: STOP_REASON.USER })
  })

  it("does not try to stop a service that is not running", async () => {
    startRecord()
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false)
    await stopSharing(STOP_REASON.USER, deps)
    expect(location.stopLocationUpdatesAsync).not.toHaveBeenCalled()
  })
})

describe("ensureRunning", () => {
  it("does nothing when there is no share, or it already ended", async () => {
    await ensureRunning("launch", deps)
    startRecord({ endedReason: STOP_REASON.TRIP_NOT_LIVE })
    await ensureRunning("launch", deps)
    expect(location.hasServicesEnabledAsync).not.toHaveBeenCalled()
  })

  it("leaves a healthy, registered task alone", async () => {
    startRecord()
    await ensureRunning("foreground", deps)
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled()
    expect(eventsOf("reregister")).toHaveLength(0)
  })

  it("registers the task again when it has gone missing, for instance after the process was killed", async () => {
    startRecord()
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false)
    await ensureRunning("launch", deps)
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1)
    expect(eventsOf("reregister")[0].reason).toBe("task-missing")
  })

  it("does not register while the system switch is off, and records that it is", async () => {
    startRecord()
    location.hasServicesEnabledAsync.mockResolvedValue(false)
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false)
    await ensureRunning("foreground", deps)
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled()
    expect(eventsOf("locsw")).toEqual([{ ev: "locsw", t: T0, on: false, source: "js" }])
  })

  it("re-registers when the switch comes back on, because a task started while it was off delivers nothing", async () => {
    startRecord()
    location.hasServicesEnabledAsync.mockResolvedValue(false)
    await ensureRunning("foreground", deps)
    location.hasServicesEnabledAsync.mockResolvedValue(true)
    await ensureRunning("foreground", deps)
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith(POSITION_TASK)
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1)
    expect(eventsOf("locsw").map((event) => event.on)).toEqual([false, true])
    expect(eventsOf("reregister")[0].reason).toBe("switch-back-on")
  })

  it("re-registers on a watchdog wake when no fix has arrived since the previous wake", async () => {
    startRecord({ lastFixAt: T0 - 7_200_000, lastWakeAt: T0 - 3_600_000 })
    await ensureRunning("watchdog", deps)
    expect(eventsOf("reregister")[0].reason).toBe("no-fix-since-last-wake")
  })

  it("does not re-register on a watchdog wake when fixes are arriving", async () => {
    startRecord({ lastFixAt: T0 - 60_000, lastWakeAt: T0 - 3_600_000 })
    await ensureRunning("watchdog", deps)
    expect(eventsOf("reregister")).toHaveLength(0)
  })
})
