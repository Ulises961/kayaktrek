import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/client"
import {
  createLog,
  deleteLog,
  endorseLog,
  getEndorsedLogs,
  getLog,
  getLogs,
  getLogStats,
  unendorseLog,
  updateLog,
} from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiPatch = apiPatch as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_LOG = { id: "01958f60-0000-7000-8000-000000000001", date: "2026-06-01" }
const VALID_PAGE = { items: [VALID_LOG], total: 1, page: 1, pages: 1 }
const VALID_STATS = {
  totalDistance: 10,
  totalHours: 2,
  logCount: 1,
  tripCount: 1,
  endorsementsReceived: 0,
  conditionsDistribution: {},
  activityByMonth: [],
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiPatch.mockReset()
  mockApiDelete.mockReset()
})

describe("getLogs", () => {
  it("hits /api/log/all with the default sort", async () => {
    mockApiGet.mockResolvedValue(VALID_PAGE)
    await getLogs()
    expect(mockApiGet).toHaveBeenCalledWith("/api/log/all?page=1&sort=newest")
  })

  it("propagates a thrown network error unchanged", async () => {
    mockApiGet.mockRejectedValue(new Error("Network request failed"))
    await expect(getLogs()).rejects.toThrow("Network request failed")
  })

  it("throws at the Zod boundary when the response is malformed", async () => {
    mockApiGet.mockResolvedValue({ items: "not-an-array", total: 1, page: 1, pages: 1 })
    await expect(getLogs()).rejects.toThrow()
  })
})

describe("getEndorsedLogs", () => {
  it("hits /api/log/endorsed", async () => {
    mockApiGet.mockResolvedValue(VALID_PAGE)
    await getEndorsedLogs()
    expect(mockApiGet).toHaveBeenCalledWith("/api/log/endorsed?page=1&sort=newest")
  })
})

describe("getLogStats", () => {
  it("hits /api/log/stats and parses the aggregate shape", async () => {
    mockApiGet.mockResolvedValue(VALID_STATS)
    const stats = await getLogStats()
    expect(mockApiGet).toHaveBeenCalledWith("/api/log/stats")
    expect(stats.logCount).toBe(1)
  })

  it("throws at the Zod boundary when a required field is missing", async () => {
    mockApiGet.mockResolvedValue({ totalDistance: 10 })
    await expect(getLogStats()).rejects.toThrow()
  })
})

describe("getLog", () => {
  it("hits GET /api/log/<id>", async () => {
    mockApiGet.mockResolvedValue(VALID_LOG)
    await getLog("log-1")
    expect(mockApiGet).toHaveBeenCalledWith("/api/log/log-1")
  })
})

describe("createLog", () => {
  it("posts the fields to /api/log/create", async () => {
    mockApiPost.mockResolvedValue(VALID_LOG)
    await createLog({ date: "2026-06-01", hours: 3 })
    expect(mockApiPost).toHaveBeenCalledWith("/api/log/create", { date: "2026-06-01", hours: 3 })
  })

  it("propagates a thrown validation error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("Max 24 hours"))
    await expect(createLog({ hours: 30 })).rejects.toThrow("Max 24 hours")
  })
})

describe("updateLog", () => {
  it("patches /api/log/<id> with the given fields", async () => {
    mockApiPatch.mockResolvedValue(VALID_LOG)
    await updateLog("log-1", { notes: "Choppy" })
    expect(mockApiPatch).toHaveBeenCalledWith("/api/log/log-1", { notes: "Choppy" })
  })
})

describe("deleteLog", () => {
  it("deletes /api/log/<id> and returns nothing else", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await deleteLog("log-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/log/log-1")
  })
})

describe("endorseLog / unendorseLog", () => {
  it("posts to /api/log/<id>/endorse", async () => {
    mockApiPost.mockResolvedValue({ message: "Log endorsed" })
    await endorseLog("log-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/log/log-1/endorse", {})
  })

  it("deletes /api/log/<id>/endorse to withdraw", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await unendorseLog("log-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/log/log-1/endorse")
  })

  it("propagates the 403 same-trip-rule error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("You can only endorse logs from a trip you shared."))
    await expect(endorseLog("log-1")).rejects.toThrow("shared")
  })
})
