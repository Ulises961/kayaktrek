import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { ApiError, OFFLINE_ERROR_MESSAGE, apiPost } from "../../api/client"
import { getSession } from "../../auth/session"
import type { PositionFix } from "../../live/position/types"
import { modelClasses } from "../models"
import {
  BUFFER_CAP,
  bufferPing,
  bufferedPingCount,
  discardBufferedPings,
  pushBufferedPings,
} from "../position-buffer"
import { appDatabaseSchema } from "../schema"

jest.mock("../database", () => ({ database: {} }))
jest.mock("../../api/client", () => ({
  ...jest.requireActual("../../api/client"),
  apiPost: jest.fn(),
}))
jest.mock("../../auth/session", () => ({ getSession: jest.fn() }))

const mockApiPost = apiPost as jest.Mock
const mockGetSession = getSession as jest.Mock

function createTestDatabase() {
  const adapter = new LokiJSAdapter({ schema: appDatabaseSchema, useWebWorker: false, useIncrementalIndexedDB: false })
  return new Database({ adapter, modelClasses })
}

const T0 = Date.UTC(2026, 10, 27, 9, 0, 0)

function fix(secondsAfterStart: number, overrides: Partial<PositionFix> = {}): PositionFix {
  return {
    lat: 46 + secondsAfterStart / 100_000,
    lon: 11,
    accuracyM: 8,
    headingDeg: null,
    speedMs: 1.5,
    timestamp: T0 + secondsAfterStart * 1000,
    ...overrides,
  }
}

type SentBatch = { pings: { lat: number; recordedAt: string }[] }
const sentBatches = (): { path: string; body: SentBatch }[] =>
  mockApiPost.mock.calls.map(([path, body]) => ({ path: path as string, body: body as SentBatch }))

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ userId: "user-1", email: "ana@example.com" })
  mockApiPost.mockResolvedValue({ accepted: 1, duplicates: 0 })
})

describe("bufferPing", () => {
  it("keeps the fix with its own time for the signed-in paddler", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0, { headingDeg: 90 }), database)
    expect(await bufferedPingCount(database)).toBe(1)

    await pushBufferedPings(database)
    expect(sentBatches()[0].body.pings[0]).toEqual({
      lat: 46,
      lon: 11,
      accuracyM: 8,
      headingDeg: 90,
      speedMs: 1.5,
      recordedAt: new Date(T0).toISOString(),
    })
  })

  it("leaves out what the phone did not report instead of sending nulls", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0, { accuracyM: null, speedMs: null }), database)
    await pushBufferedPings(database)
    const [ping] = sentBatches()[0].body.pings
    expect(ping).not.toHaveProperty("accuracyM")
    expect(ping).not.toHaveProperty("headingDeg")
    expect(ping).not.toHaveProperty("speedMs")
  })

  it("keeps nothing when nobody is signed in, since the fix could not be attributed", async () => {
    mockGetSession.mockResolvedValue(null)
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "ana@example.com" })
    expect(await bufferedPingCount(database)).toBe(0)
  })

  it("drops the oldest fixes once the buffer is full, keeping the newest", async () => {
    const database = createTestDatabase()
    for (let index = 0; index < BUFFER_CAP + 3; index += 1) {
      await bufferPing("trip-1", fix(index), database)
    }
    expect(await bufferedPingCount(database)).toBe(BUFFER_CAP)

    mockApiPost.mockImplementation(async (_path: string, body: SentBatch) => ({
      accepted: body.pings.length,
      duplicates: 0,
    }))
    await pushBufferedPings(database)
    const firstSent = sentBatches()[0].body.pings[0]
    expect(firstSent.recordedAt).toBe(new Date(T0 + 3_000).toISOString())
  }, 60_000)
})

describe("pushBufferedPings", () => {
  it("sends nothing and makes no request when the buffer is empty", async () => {
    const database = createTestDatabase()
    expect(await pushBufferedPings(database)).toEqual({ sent: 0, discarded: 0 })
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("sends oldest first to the trip's batch endpoint, and forgets what was accepted", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(20), database)
    await bufferPing("trip-1", fix(0), database)
    await bufferPing("trip-1", fix(10), database)
    mockApiPost.mockResolvedValue({ accepted: 3, duplicates: 0 })

    const summary = await pushBufferedPings(database)

    expect(summary).toEqual({ sent: 3, discarded: 0 })
    expect(sentBatches()).toHaveLength(1)
    expect(sentBatches()[0].path).toBe("/api/live/trip/trip-1/positions")
    expect(sentBatches()[0].body.pings.map((ping) => ping.recordedAt)).toEqual([
      new Date(T0).toISOString(),
      new Date(T0 + 10_000).toISOString(),
      new Date(T0 + 20_000).toISOString(),
    ])
    expect(await bufferedPingCount(database)).toBe(0)
  })

  it("counts a ping the server already had as sent, so a resend after a lost reply ends", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    await bufferPing("trip-1", fix(10), database)
    mockApiPost.mockResolvedValue({ accepted: 0, duplicates: 2 })

    expect(await pushBufferedPings(database)).toEqual({ sent: 2, discarded: 0 })
    expect(await bufferedPingCount(database)).toBe(0)
  })

  it("splits a long backlog into batches of 100, oldest first", async () => {
    const database = createTestDatabase()
    for (let index = 0; index < 250; index += 1) await bufferPing("trip-1", fix(index), database)
    mockApiPost.mockImplementation(async (_path: string, body: SentBatch) => ({
      accepted: body.pings.length,
      duplicates: 0,
    }))

    expect(await pushBufferedPings(database)).toEqual({ sent: 250, discarded: 0 })
    expect(sentBatches().map((call) => call.body.pings.length)).toEqual([100, 100, 50])
    expect(sentBatches()[1].body.pings[0].recordedAt).toBe(new Date(T0 + 100_000).toISOString())
  })

  it("sends each trip's fixes to that trip", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    await bufferPing("trip-2", fix(5), database)
    mockApiPost.mockResolvedValue({ accepted: 1, duplicates: 0 })

    await pushBufferedPings(database)

    expect(sentBatches().map((call) => call.path).sort()).toEqual([
      "/api/live/trip/trip-1/positions",
      "/api/live/trip/trip-2/positions",
    ])
  })

  it("keeps everything and rethrows when there is no connection, so the push retries", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    mockApiPost.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    await expect(pushBufferedPings(database)).rejects.toThrow(OFFLINE_ERROR_MESSAGE)
    expect(await bufferedPingCount(database)).toBe(1)
  })

  it("keeps the rest of a backlog when a later batch fails, having forgotten the batches that went", async () => {
    const database = createTestDatabase()
    for (let index = 0; index < 150; index += 1) await bufferPing("trip-1", fix(index), database)
    mockApiPost
      .mockResolvedValueOnce({ accepted: 100, duplicates: 0 })
      .mockRejectedValueOnce(new Error(OFFLINE_ERROR_MESSAGE))

    await expect(pushBufferedPings(database)).rejects.toThrow(OFFLINE_ERROR_MESSAGE)
    expect(await bufferedPingCount(database)).toBe(50)
  })

  it("keeps a backlog the server is rate-limiting, to try again later", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    mockApiPost.mockRejectedValue(new ApiError("Too many requests", 429))

    await expect(pushBufferedPings(database)).rejects.toBeInstanceOf(ApiError)
    expect(await bufferedPingCount(database)).toBe(1)
  })

  it.each([
    [409, "the trip is no longer happening"],
    [403, "the paddler is no longer on the trip"],
    [404, "the trip is gone"],
  ])("discards that trip's fixes when the server answers %i (%s), and carries on with the others", async (status) => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    await bufferPing("trip-1", fix(10), database)
    await bufferPing("trip-2", fix(5), database)
    mockApiPost.mockImplementation(async (path: string) => {
      if (path.includes("trip-1")) throw new ApiError("no", status)
      return { accepted: 1, duplicates: 0 }
    })

    expect(await pushBufferedPings(database)).toEqual({ sent: 1, discarded: 2 })
    expect(await bufferedPingCount(database)).toBe(0)
  })

  it("only sends the signed-in paddler's fixes, never another account's on the same phone", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    mockGetSession.mockResolvedValue({ userId: "user-2", email: "ben@example.com" })
    await bufferPing("trip-1", fix(10), database)

    await pushBufferedPings(database)

    expect(sentBatches()).toHaveLength(1)
    expect(sentBatches()[0].body.pings).toHaveLength(1)
    expect(sentBatches()[0].body.pings[0].recordedAt).toBe(new Date(T0 + 10_000).toISOString())
    expect(await bufferedPingCount(database)).toBe(0)

    mockGetSession.mockResolvedValue({ userId: "user-1", email: "ana@example.com" })
    expect(await bufferedPingCount(database)).toBe(1)
  })

  it("sends nothing when nobody is signed in", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    mockGetSession.mockResolvedValue(null)
    expect(await pushBufferedPings(database)).toEqual({ sent: 0, discarded: 0 })
    expect(mockApiPost).not.toHaveBeenCalled()
  })
})

describe("discardBufferedPings", () => {
  it("forgets one trip's fixes and leaves the others", async () => {
    const database = createTestDatabase()
    await bufferPing("trip-1", fix(0), database)
    await bufferPing("trip-2", fix(5), database)
    await discardBufferedPings("trip-1", database)
    expect(await bufferedPingCount(database)).toBe(1)
  })
})
