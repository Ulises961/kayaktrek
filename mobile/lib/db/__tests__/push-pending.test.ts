/* eslint-disable @typescript-eslint/no-require-imports --
   jest.resetModules() only affects later require() calls, and a fresh copy of
   the module per test is the point: its retry counter and in-flight push are
   module state. */
import { ApiError } from "../../api/client"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../mutation-queue", () => ({ pushQueuedMutations: jest.fn() }))
jest.mock("../route-edit", () => ({ pushRouteChanges: jest.fn(), tripsWithRouteChanges: jest.fn() }))
jest.mock("../position-buffer", () => ({ pushBufferedPings: jest.fn() }))

type PushPending = typeof import("../push-pending")
type PushStatusModule = typeof import("../../network/push-status")

let pushPendingModule: PushPending
let statusModule: PushStatusModule
let mockPushQueued: jest.Mock
let mockPushRoute: jest.Mock
let mockTripsWithChanges: jest.Mock
let mockPushPositions: jest.Mock

// The module keeps its in-flight/backoff state at module level (it is one phone's
// one push pipeline), so each test gets a fresh copy rather than inheriting the
// previous test's retry counter.
beforeEach(() => {
  jest.useFakeTimers()
  jest.resetModules()
  mockPushQueued = require("../mutation-queue").pushQueuedMutations
  mockPushRoute = require("../route-edit").pushRouteChanges
  mockTripsWithChanges = require("../route-edit").tripsWithRouteChanges
  mockPushPositions = require("../position-buffer").pushBufferedPings
  mockPushQueued.mockReset().mockResolvedValue({ applied: 0, rejected: 0, kept: 0 })
  mockPushRoute.mockReset().mockResolvedValue("pushed")
  mockTripsWithChanges.mockReset().mockResolvedValue([])
  mockPushPositions.mockReset().mockResolvedValue({ sent: 0, discarded: 0 })
  pushPendingModule = require("../push-pending")
  statusModule = require("../../network/push-status")
})
afterEach(() => jest.useRealTimers())

const OFFLINE = new TypeError("Network request failed")

describe("pushPending", () => {
  it("pushes every trip's edited route before the queued changes, and reports sent", async () => {
    const order: string[] = []
    mockTripsWithChanges.mockResolvedValue(["trip-a", "trip-b"])
    mockPushRoute.mockImplementation(async (tripId: string) => {
      order.push(`route:${tripId}`)
      return "pushed"
    })
    mockPushQueued.mockImplementation(async () => {
      order.push("queue")
      return { applied: 1, rejected: 0, kept: 0 }
    })

    const result = await pushPendingModule.pushPending()

    expect(result).toBe("sent")
    expect(order).toEqual(["route:trip-a", "route:trip-b", "queue"])
  })

  it("treats a parked route conflict as sent, not failed — retrying cannot resolve it", async () => {
    mockTripsWithChanges.mockResolvedValue(["trip-a"])
    mockPushRoute.mockResolvedValue("conflict")

    expect(await pushPendingModule.pushPending()).toBe("sent")
    expect(statusModule.getPushStatus().state).toBe("idle")
  })

  it("keeps going when one trip's route push fails: the others and the queue still go", async () => {
    mockTripsWithChanges.mockResolvedValue(["trip-a", "trip-b"])
    mockPushRoute.mockRejectedValueOnce(OFFLINE).mockResolvedValueOnce("pushed")

    const result = await pushPendingModule.pushPending()

    expect(result).toBe("failed")
    expect(mockPushRoute).toHaveBeenCalledTimes(2)
    expect(mockPushQueued).toHaveBeenCalledTimes(1)
  })

  it("reports failed when the queue push throws, and never rejects", async () => {
    mockPushQueued.mockRejectedValue(new ApiError("down", 503))

    await expect(pushPendingModule.pushPending()).resolves.toBe("failed")
  })

  it("sends the buffered position fixes after the queued changes", async () => {
    const order: string[] = []
    mockPushQueued.mockImplementation(async () => {
      order.push("queue")
      return { applied: 0, rejected: 0, kept: 0 }
    })
    mockPushPositions.mockImplementation(async () => {
      order.push("positions")
      return { sent: 12, discarded: 0 }
    })

    expect(await pushPendingModule.pushPending()).toBe("sent")
    expect(order).toEqual(["queue", "positions"])
  })

  it("reports failed when the position fixes cannot be sent, and still sent the queue", async () => {
    mockPushPositions.mockRejectedValue(OFFLINE)

    expect(await pushPendingModule.pushPending()).toBe("failed")
    expect(mockPushQueued).toHaveBeenCalledTimes(1)
  })

  it("keeps sending the position fixes when the queue push fails", async () => {
    mockPushQueued.mockRejectedValue(OFFLINE)

    expect(await pushPendingModule.pushPending()).toBe("failed")
    expect(mockPushPositions).toHaveBeenCalledTimes(1)
  })

  it("never runs two pushes at once, and a request made mid-flight gets a second pass", async () => {
    let release: () => void = () => undefined
    mockTripsWithChanges.mockResolvedValueOnce(["trip-a"]).mockResolvedValueOnce(["trip-a"])
    mockPushRoute.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve("pushed"))),
    )

    const first = pushPendingModule.pushPending()
    await Promise.resolve()
    const second = pushPendingModule.pushPending()
    expect(mockPushRoute).toHaveBeenCalledTimes(1)

    release()
    await Promise.all([first, second])

    // The edit made while the first push was in the air is not left for the next trigger.
    expect(mockPushRoute).toHaveBeenCalledTimes(2)
  })
})

describe("retry after a failed push", () => {
  it("retries at 5s, 15s and 60s, then stops and leaves it to the next sweep", async () => {
    mockPushQueued.mockRejectedValue(OFFLINE)

    await pushPendingModule.pushPending()
    expect(mockPushQueued).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(4999)
    expect(mockPushQueued).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    expect(mockPushQueued).toHaveBeenCalledTimes(2)

    await jest.advanceTimersByTimeAsync(15000)
    expect(mockPushQueued).toHaveBeenCalledTimes(3)

    await jest.advanceTimersByTimeAsync(60000)
    expect(mockPushQueued).toHaveBeenCalledTimes(4)

    await jest.advanceTimersByTimeAsync(10 * 60000)
    expect(mockPushQueued).toHaveBeenCalledTimes(4)
    expect(statusModule.getPushStatus()).toEqual({ state: "failed", retryAt: null })
  })

  it("stops retrying and goes idle as soon as one succeeds", async () => {
    mockPushQueued.mockRejectedValueOnce(OFFLINE)

    await pushPendingModule.pushPending()
    expect(statusModule.getPushStatus().state).toBe("failed")

    await jest.advanceTimersByTimeAsync(5000)
    expect(mockPushQueued).toHaveBeenCalledTimes(2)
    expect(statusModule.getPushStatus()).toEqual({ state: "idle", retryAt: null })

    await jest.advanceTimersByTimeAsync(10 * 60000)
    expect(mockPushQueued).toHaveBeenCalledTimes(2)
  })

  it("publishes when the next retry is due while waiting", async () => {
    mockPushQueued.mockRejectedValue(OFFLINE)
    jest.setSystemTime(1_000_000)

    await pushPendingModule.pushPending()

    expect(statusModule.getPushStatus()).toEqual({ state: "failed", retryAt: 1_005_000 })
  })

  it("a manual retry restarts the schedule from 5s, even after the automatic ones gave up", async () => {
    mockPushQueued.mockRejectedValue(OFFLINE)
    await pushPendingModule.pushPending()
    await jest.advanceTimersByTimeAsync(5000 + 15000 + 60000)
    expect(mockPushQueued).toHaveBeenCalledTimes(4)
    expect(statusModule.getPushStatus().retryAt).toBeNull()

    const result = await pushPendingModule.retryPushNow()

    expect(result).toBe("failed")
    expect(mockPushQueued).toHaveBeenCalledTimes(5)
    // Failing again re-arms the backoff — the button must not be a one-shot that
    // then goes quiet.
    await jest.advanceTimersByTimeAsync(5000)
    expect(mockPushQueued).toHaveBeenCalledTimes(6)
  })

  it("is what the banner's button reaches through the status module, which imports no database", async () => {
    mockPushQueued.mockRejectedValueOnce(OFFLINE)
    await pushPendingModule.pushPending()

    const result = await statusModule.retryPush()

    expect(result).toBe("sent")
    expect(mockPushQueued).toHaveBeenCalledTimes(2)
    expect(statusModule.getPushStatus().state).toBe("idle")
  })

  it("a manual retry cancels the pending automatic one, so they never double up", async () => {
    mockPushQueued.mockRejectedValueOnce(OFFLINE)
    await pushPendingModule.pushPending()

    await pushPendingModule.retryPushNow()
    expect(mockPushQueued).toHaveBeenCalledTimes(2)

    await jest.advanceTimersByTimeAsync(5000)
    expect(mockPushQueued).toHaveBeenCalledTimes(2)
  })
})

describe("push status", () => {
  it("notifies subscribers as it moves pushing -> failed -> idle", async () => {
    const seen: string[] = []
    statusModule.subscribePushStatus(() => seen.push(statusModule.getPushStatus().state))
    mockPushQueued.mockRejectedValueOnce(OFFLINE)

    await pushPendingModule.pushPending()
    await jest.advanceTimersByTimeAsync(5000)

    expect(seen).toEqual(["pushing", "failed", "pushing", "idle"])
  })

  it("stops notifying an unsubscribed listener", async () => {
    const listener = jest.fn()
    const unsubscribe = statusModule.subscribePushStatus(listener)
    unsubscribe()

    await pushPendingModule.pushPending()

    expect(listener).not.toHaveBeenCalled()
  })
})
