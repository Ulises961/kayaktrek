import { OFFLINE_ERROR_MESSAGE } from "../../api/client"
import { removeCachedLog, upsertCachedLog } from "../../db/logs-cache"
import { enqueueMutation, pushQueuedMutations } from "../../db/mutation-queue"
import { createLog, deleteLog, updateLog } from "../actions"
import { createLogAnywhere, deleteLogAnywhere, updateLogAnywhere } from "../offline-logs"

jest.mock("../actions", () => ({ createLog: jest.fn(), updateLog: jest.fn(), deleteLog: jest.fn() }))
jest.mock("../../db/logs-cache", () => ({ upsertCachedLog: jest.fn(), removeCachedLog: jest.fn() }))
jest.mock("../../db/mutation-queue", () => ({
  ...jest.requireActual("../../db/mutation-queue"),
  enqueueMutation: jest.fn(),
  pushQueuedMutations: jest.fn(),
}))

const mockCreateLog = createLog as jest.Mock
const mockUpdateLog = updateLog as jest.Mock
const mockDeleteLog = deleteLog as jest.Mock
const mockUpsert = upsertCachedLog as jest.Mock
const mockRemove = removeCachedLog as jest.Mock
const mockEnqueue = enqueueMutation as jest.Mock
const mockPush = pushQueuedMutations as jest.Mock

const FIELDS = { date: "2026-10-02", hours: 4, distance: 14, avgSea: 3, notes: "Headwind" }

beforeEach(() => {
  jest.clearAllMocks()
  mockEnqueue.mockResolvedValue("mutation-1")
  mockPush.mockResolvedValue({ applied: 0, rejected: 0, kept: 1 })
  mockUpsert.mockResolvedValue(undefined)
  mockRemove.mockResolvedValue(undefined)
})

// M9d WP8: a log written at camp. With signal it goes straight to the server; with
// none it is queued, and the logs list shows it at once.
describe("createLogAnywhere", () => {
  it("creates the log on the server when it can", async () => {
    mockCreateLog.mockResolvedValue({ id: "log-1", ...FIELDS })

    expect(await createLogAnywhere(FIELDS)).toBe("sent")
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it("queues it under an id the phone chooses when there is no signal", async () => {
    mockCreateLog.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    expect(await createLogAnywhere(FIELDS)).toBe("queued")

    const envelope = mockEnqueue.mock.calls[0][0]
    expect(envelope).toMatchObject({ entityType: "log", operation: "create", payload: FIELDS })
    expect(envelope.entityId).toMatch(/^[0-9a-f-]{36}$/)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: envelope.entityId, date: "2026-10-02", hours: 4 }),
      "mine",
    )
  })

  it("does not queue a log the server refused", async () => {
    mockCreateLog.mockRejectedValue(new Error("hours: Max 24 hours"))

    await expect(createLogAnywhere(FIELDS)).rejects.toThrow("Max 24 hours")
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})

describe("updateLogAnywhere", () => {
  it("returns the server's updated log when it can reach it", async () => {
    mockUpdateLog.mockResolvedValue({ id: "log-1", ...FIELDS })

    expect(await updateLogAnywhere("log-1", FIELDS)).toMatchObject({ id: "log-1" })
  })

  it("queues the edit and updates the cached card when there is no signal", async () => {
    mockUpdateLog.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    expect(await updateLogAnywhere("log-1", { hours: 5 })).toBeNull()

    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "log",
      operation: "update",
      entityId: "log-1",
      payload: { hours: 5 },
    })
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: "log-1", hours: 5 }), "mine")
  })
})

describe("deleteLogAnywhere", () => {
  it("queues the delete and drops the cached card when there is no signal", async () => {
    mockDeleteLog.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    expect(await deleteLogAnywhere("log-1")).toBe("queued")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "log", operation: "delete", entityId: "log-1" }),
    )
    expect(mockRemove).toHaveBeenCalledWith("log-1")
  })
})
