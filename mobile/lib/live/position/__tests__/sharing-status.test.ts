import { describeStatus, formatAge, sharingStatus, type SharingFacts } from "../sharing-status"
import { SEND_FAILURE, STOP_REASON, type SharingRecord } from "../types"

const NOW = 20 * 3_600_000

function record(overrides: Partial<SharingRecord> = {}): SharingRecord {
  return {
    target: { kind: "trip", tripId: "trip-1" },
    startedAt: NOW - 3_600_000,
    lastSentAt: NOW - 120_000,
    lastFixAt: NOW - 60_000,
    lastWakeAt: null,
    lastFailure: null,
    endedReason: null,
    ...overrides,
  }
}

function facts(overrides: Partial<SharingFacts> = {}): SharingFacts {
  return {
    record: record(),
    permissionGranted: true,
    locationServicesOn: true,
    taskRunning: true,
    now: NOW,
    ...overrides,
  }
}

describe("sharingStatus", () => {
  it("is off with no record", () => {
    expect(sharingStatus(facts({ record: null }))).toEqual({ kind: "off" })
  })

  it("reports a share that ended by itself, ahead of everything else", () => {
    const status = sharingStatus(
      facts({ record: record({ endedReason: STOP_REASON.TRIP_NOT_LIVE }), locationServicesOn: false }),
    )
    expect(status).toEqual({ kind: "ended", reason: STOP_REASON.TRIP_NOT_LIVE })
  })

  it("says so when the app's location permission is gone", () => {
    expect(sharingStatus(facts({ permissionGranted: false }))).toEqual({ kind: "needs-permission" })
  })

  it("says so when the system location switch is off, which the app permission does not show", () => {
    expect(sharingStatus(facts({ locationServicesOn: false }))).toEqual({ kind: "location-off" })
  })

  it("says so when the task is not registered although a share exists", () => {
    expect(sharingStatus(facts({ taskRunning: false }))).toEqual({ kind: "not-running" })
  })

  it("does not claim a problem for facts it could not read", () => {
    const status = sharingStatus(facts({ permissionGranted: null, locationServicesOn: null, taskRunning: null }))
    expect(status).toEqual({ kind: "sharing", lastSentAt: NOW - 120_000 })
  })

  it("is starting until the first ping has gone out", () => {
    expect(sharingStatus(facts({ record: record({ lastSentAt: null }) }))).toEqual({ kind: "starting" })
  })

  it("is failing when the last attempt failed after the last success", () => {
    const failure = { at: NOW - 30_000, reason: SEND_FAILURE.OFFLINE }
    expect(sharingStatus(facts({ record: record({ lastFailure: failure }) }))).toEqual({
      kind: "failing",
      reason: SEND_FAILURE.OFFLINE,
      since: NOW - 30_000,
      lastSentAt: NOW - 120_000,
    })
  })

  it("is healthy again once a ping went out after the failure", () => {
    const failure = { at: NOW - 300_000, reason: SEND_FAILURE.OFFLINE }
    expect(sharingStatus(facts({ record: record({ lastFailure: failure }) }))).toEqual({
      kind: "sharing",
      lastSentAt: NOW - 120_000,
    })
  })
})

describe("formatAge", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [60_000, "1 min ago"],
    [59 * 60_000, "59 min ago"],
    [60 * 60_000, "1 h ago"],
    [95 * 60_000, "1 h 35 min ago"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(formatAge(ms)).toBe(expected)
  })
})

describe("describeStatus", () => {
  it("names the system switch and where to find it", () => {
    expect(describeStatus({ kind: "location-off" }, NOW)).toMatch(/switched off on this phone/)
  })

  it("gives the age of the last ping while sharing", () => {
    expect(describeStatus({ kind: "sharing", lastSentAt: NOW - 120_000 }, NOW)).toBe(
      `Sharing is on. Last sent ${formatAge(120_000)}.`,
    )
  })

  it("names why a send failed and when the last one worked", () => {
    const text = describeStatus(
      { kind: "failing", reason: SEND_FAILURE.OFFLINE, since: NOW - 30_000, lastSentAt: NOW - 600_000 },
      NOW,
    )
    expect(text).toMatch(/no connection/)
    expect(text).toContain(formatAge(600_000))
  })

  it("says nothing has been sent when a share has never got a ping out", () => {
    const text = describeStatus(
      { kind: "failing", reason: SEND_FAILURE.SERVER, since: NOW - 30_000, lastSentAt: null },
      NOW,
    )
    expect(text).toMatch(/Nothing has been sent yet/)
  })

  it("explains each way a share can end", () => {
    expect(describeStatus({ kind: "ended", reason: STOP_REASON.TRIP_NOT_LIVE }, NOW)).toMatch(/no longer under way/)
    expect(describeStatus({ kind: "ended", reason: STOP_REASON.NOT_ON_TRIP }, NOW)).toMatch(/no longer on this trip/)
  })
})
