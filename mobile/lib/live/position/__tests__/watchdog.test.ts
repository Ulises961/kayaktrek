import type { SpikeEvent } from "../../../spike/run-report"
import { deliver, ensureRunning } from "../position-engine"
import { getSharingRecord, setSharingRecord } from "../sharing-state"
import { STOP_REASON, type PositionFix, type SharingRecord } from "../types"
import { runWatchdog, type WatchdogDeps } from "../watchdog"
import { unregisterWatchdog } from "../watchdog-schedule"

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
jest.mock("../position-engine", () => ({ deliver: jest.fn(), ensureRunning: jest.fn() }))
jest.mock("../watchdog-schedule", () => ({ unregisterWatchdog: jest.fn() }))

const deliverMock = jest.mocked(deliver)
const ensureRunningMock = jest.mocked(ensureRunning)

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0)
const FIX: PositionFix = { lat: 46, lon: 11, accuracyM: 10, headingDeg: null, speedMs: null, timestamp: NOW }

let events: SpikeEvent[]
let currentFix: jest.Mock
let deps: WatchdogDeps

function startRecord(overrides: Partial<SharingRecord> = {}): void {
  setSharingRecord({
    target: { kind: "trip", tripId: "trip-1" },
    startedAt: NOW - 7_200_000,
    lastSentAt: NOW - 3_600_000,
    lastFixAt: null,
    lastWakeAt: NOW - 3_600_000,
    lastFailure: null,
    endedReason: null,
    ...overrides,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  setSharingRecord(null)
  events = []
  currentFix = jest.fn().mockResolvedValue(FIX)
  deps = { now: () => NOW, send: jest.fn(), log: (event) => events.push(event), currentFix }
  deliverMock.mockResolvedValue({ kind: "sent" })
})

const watchdogEvents = () => events.filter((event) => event.ev === "watchdog")

describe("runWatchdog", () => {
  it("sends one fresh fix when nothing has gone out lately, and says so in the log", async () => {
    startRecord()
    await runWatchdog(deps)
    expect(deliverMock).toHaveBeenCalledWith(FIX, "keep-alive", deps)
    expect(watchdogEvents()).toEqual([{ ev: "watchdog", t: NOW, outcome: "sent", sinceLastWakeMs: 3_600_000 }])
  })

  it("does nothing but note the wake when a ping went out recently", async () => {
    startRecord({ lastSentAt: NOW - 60_000 })
    await runWatchdog(deps)
    expect(currentFix).not.toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
    expect(watchdogEvents()[0]).toMatchObject({ outcome: "recent" })
  })

  it("checks the service is healthy before anything else, and remembers when it woke", async () => {
    startRecord({ lastSentAt: NOW - 60_000 })
    await runWatchdog(deps)
    expect(ensureRunningMock).toHaveBeenCalledWith("watchdog", deps)
    expect(getSharingRecord()).toMatchObject({ lastWakeAt: NOW })
  })

  it("records a first wake with no earlier wake to measure from", async () => {
    startRecord({ lastWakeAt: null, lastSentAt: NOW - 60_000 })
    await runWatchdog(deps)
    expect(watchdogEvents()[0]).toMatchObject({ sinceLastWakeMs: null })
  })

  it("records that it could not get a fix, instead of sending a stale one", async () => {
    startRecord()
    currentFix.mockResolvedValue(null)
    await runWatchdog(deps)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(watchdogEvents()[0]).toMatchObject({ outcome: "no-fix" })
  })

  it("records a ping that did not get through", async () => {
    startRecord()
    deliverMock.mockResolvedValue({ kind: "retry", reason: "offline" })
    await runWatchdog(deps)
    expect(watchdogEvents()[0]).toMatchObject({ outcome: "failed" })
  })

  it("records that the trip ended when the keep-alive learns it", async () => {
    startRecord()
    deliverMock.mockResolvedValue({ kind: "stop", reason: STOP_REASON.TRIP_NOT_LIVE })
    await runWatchdog(deps)
    expect(watchdogEvents()[0]).toMatchObject({ outcome: "stopped" })
  })

  it("removes itself when there is no share left to keep alive", async () => {
    await runWatchdog(deps)
    expect(unregisterWatchdog).toHaveBeenCalled()
    expect(ensureRunningMock).not.toHaveBeenCalled()
    expect(watchdogEvents()[0]).toMatchObject({ outcome: "no-share" })
  })

  it("removes itself after a share that ended by itself", async () => {
    startRecord({ endedReason: STOP_REASON.TRIP_NOT_LIVE })
    await runWatchdog(deps)
    expect(unregisterWatchdog).toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
  })
})
