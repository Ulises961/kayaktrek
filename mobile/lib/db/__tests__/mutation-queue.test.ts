import { Database } from "nitromelondb"
import LokiJSAdapter from "nitromelondb/adapters/lokijs"

import { OFFLINE_ERROR_MESSAGE, apiPost } from "../../api/client"
import { getSession } from "../../auth/session"
import { modelClasses } from "../models"
import {
  MUTATION_ENTITY,
  MUTATION_OPERATION,
  MUTATION_STATUS,
  clearMutationsForUser,
  discardMutation,
  enqueueMutation,
  loadQueuedMutations,
  pushQueuedMutations,
} from "../mutation-queue"
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
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  })
  return new Database({ adapter, modelClasses })
}

const TICK = {
  entityType: MUTATION_ENTITY.PACKING_ITEM,
  operation: MUTATION_OPERATION.UPDATE,
  entityId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01",
  payload: { checked: true },
}

// Answers every queued envelope with the given status.
function answerAll(status: string, extra: Record<string, unknown> = {}) {
  mockApiPost.mockImplementation(async (_path: string, body: { mutations: { mutationId: string }[] }) => ({
    results: body.mutations.map((envelope) => ({ mutationId: envelope.mutationId, status, ...extra })),
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ userId: "user-1", email: "ana@example.com" })
})

describe("enqueueMutation", () => {
  it("queues the change with when it happened and who made it", async () => {
    const database = createTestDatabase()
    const at = new Date("2026-09-25T10:00:00Z")

    await enqueueMutation(TICK, database, at)

    const [queued] = await loadQueuedMutations(database)
    expect(queued).toMatchObject({
      entityType: MUTATION_ENTITY.PACKING_ITEM,
      operation: MUTATION_OPERATION.UPDATE,
      entityId: TICK.entityId,
      payload: { checked: true },
      deviceTimestamp: at.toISOString(),
      status: MUTATION_STATUS.PENDING,
    })
  })

  it("refuses to queue anything when nobody is signed in", async () => {
    const database = createTestDatabase()
    mockGetSession.mockResolvedValue(null)

    await expect(enqueueMutation(TICK, database)).rejects.toThrow()
  })
})

describe("pushQueuedMutations", () => {
  it("sends the queue as one batch of envelopes, oldest first", async () => {
    const database = createTestDatabase()
    await enqueueMutation({ ...TICK, payload: { checked: false } }, database, new Date("2026-09-25T10:05:00Z"))
    await enqueueMutation(TICK, database, new Date("2026-09-25T10:00:00Z"))
    answerAll("applied")

    await pushQueuedMutations(database)

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    const [path, body] = mockApiPost.mock.calls[0]
    expect(path).toBe("/api/sync/mutations")
    expect(body.mutations.map((envelope: { payload: unknown }) => envelope.payload)).toEqual([
      { checked: true },
      { checked: false },
    ])
    expect(body.mutations[0]).toMatchObject({
      entityType: "packing_item",
      operation: "update",
      entityId: TICK.entityId,
      deviceTimestamp: "2026-09-25T10:00:00.000Z",
    })
  })

  it("forgets what the server applied", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    answerAll("applied")

    const summary = await pushQueuedMutations(database)

    expect(summary.applied).toBe(1)
    expect(await loadQueuedMutations(database)).toEqual([])
  })

  // A batch resent after a dropped response: the server already had it.
  it("forgets what the server had already applied", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    answerAll("duplicate", { result: "applied" })

    await pushQueuedMutations(database)

    expect(await loadQueuedMutations(database)).toEqual([])
  })

  it("keeps a rejected change, with the reason, for the paddler to see", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    answerAll("rejected", { reason: "That packing item no longer exists." })

    const summary = await pushQueuedMutations(database)

    expect(summary.rejected).toBe(1)
    const [kept] = await loadQueuedMutations(database)
    expect(kept.status).toBe(MUTATION_STATUS.REJECTED)
    expect(kept.reason).toBe("That packing item no longer exists.")
  })

  it("does not resend a rejected change", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    answerAll("rejected", { reason: "No." })
    await pushQueuedMutations(database)
    mockApiPost.mockClear()

    await pushQueuedMutations(database)

    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("keeps a change the server couldn't process now, to send again", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    answerAll("failed")

    await pushQueuedMutations(database)

    const [kept] = await loadQueuedMutations(database)
    expect(kept.status).toBe(MUTATION_STATUS.PENDING)
  })

  it("keeps everything queued when there is no connection", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    mockApiPost.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    await expect(pushQueuedMutations(database)).rejects.toThrow(OFFLINE_ERROR_MESSAGE)

    expect(await loadQueuedMutations(database)).toHaveLength(1)
  })

  it("sends nothing when the queue is empty", async () => {
    const database = createTestDatabase()

    await pushQueuedMutations(database)

    expect(mockApiPost).not.toHaveBeenCalled()
  })

  // The queue belongs to whoever made the changes; another account signing in on
  // the same phone must not send them as its own.
  it("only sends the signed-in paddler's changes", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    mockGetSession.mockResolvedValue({ userId: "user-2", email: "other@example.com" })

    await pushQueuedMutations(database)

    expect(mockApiPost).not.toHaveBeenCalled()
  })
})

describe("discarding", () => {
  it("drops one change the paddler has read and dismissed", async () => {
    const database = createTestDatabase()
    const mutationId = await enqueueMutation(TICK, database)

    await discardMutation(mutationId, database)

    expect(await loadQueuedMutations(database)).toEqual([])
  })

  it("drops everything a paddler queued, on sign-out", async () => {
    const database = createTestDatabase()
    await enqueueMutation(TICK, database)
    await enqueueMutation(TICK, database)

    await clearMutationsForUser("user-1", database)

    expect(await loadQueuedMutations(database)).toEqual([])
  })
})
