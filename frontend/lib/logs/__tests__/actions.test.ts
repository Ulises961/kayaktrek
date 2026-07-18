import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createLog,
  updateLog,
  deleteLog,
  endorseLog,
  unendorseLog,
  listMyLogs,
  listEndorsedLogs,
} from "../actions"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { revalidatePath } from "next/cache"
import { LOG_SORT } from "@/lib/dtos/log"

const GET = apiGet as ReturnType<typeof vi.fn>
const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>
const DELETE = apiDelete as ReturnType<typeof vi.fn>

const EMPTY_PAGE = { items: [], total: 0, page: 1, pages: 1 }

beforeEach(() => vi.clearAllMocks())

describe("createLog", () => {
  it("posts to /api/log/create with fields", async () => {
    POST.mockResolvedValue({ id: "abc" })
    const result = await createLog({ date: "2026-07-01", hours: 5 })
    expect(POST).toHaveBeenCalledWith("/api/log/create", { date: "2026-07-01", hours: 5 })
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("returns error on failure", async () => {
    POST.mockRejectedValue(new Error("Server error"))
    const result = await createLog({ date: "2026-07-01" })
    expect(result).toEqual({ success: false, error: "Server error" })
  })
})

describe("updateLog", () => {
  it("patches /api/log/:id with fields", async () => {
    PATCH.mockResolvedValue({})
    const result = await updateLog("log-1", { hours: 3 })
    expect(PATCH).toHaveBeenCalledWith("/api/log/log-1", { hours: 3 })
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("returns error on failure", async () => {
    PATCH.mockRejectedValue(new Error("Not found"))
    const result = await updateLog("log-1", { hours: 3 })
    expect(result).toEqual({ success: false, error: "Not found" })
  })
})

describe("deleteLog", () => {
  it("deletes /api/log/:id and revalidates the logs list", async () => {
    DELETE.mockResolvedValue({})
    const result = await deleteLog("log-1")
    expect(DELETE).toHaveBeenCalledWith("/api/log/log-1")
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("returns error on failure", async () => {
    DELETE.mockRejectedValue(new Error("Forbidden"))
    const result = await deleteLog("log-1")
    expect(result).toEqual({ success: false, error: "Forbidden" })
  })
})

describe("endorseLog", () => {
  it("posts to the endorse endpoint and revalidates", async () => {
    POST.mockResolvedValue({ message: "Log endorsed" })
    const result = await endorseLog("log-1")
    expect(POST).toHaveBeenCalledWith("/api/log/log-1/endorse", {})
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("maps 403 to the shared-trip message", async () => {
    POST.mockRejectedValue(new Error("POST ... failed: 403"))
    const result = await endorseLog("log-1")
    expect(result).toEqual({
      success: false,
      error: "You can only endorse logs from a trip you shared.",
    })
  })

  it("maps 422 to the non-endorsable message", async () => {
    POST.mockRejectedValue(new Error("POST ... failed: 422"))
    const result = await endorseLog("log-1")
    expect(result).toEqual({
      success: false,
      error: "This log isn't linked to a trip, so it can't be endorsed.",
    })
  })
})

describe("unendorseLog", () => {
  it("deletes the endorsement and revalidates", async () => {
    DELETE.mockResolvedValue(undefined)
    const result = await unendorseLog("log-1")
    expect(DELETE).toHaveBeenCalledWith("/api/log/log-1/endorse")
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("returns a generic error on failure", async () => {
    DELETE.mockRejectedValue(new Error("boom"))
    const result = await unendorseLog("log-1")
    expect(result).toEqual({ success: false, error: "Failed to withdraw endorsement." })
  })
})

describe("listMyLogs", () => {
  it("fetches page 1 with the default sort", async () => {
    GET.mockResolvedValue(EMPTY_PAGE)
    await listMyLogs()
    expect(GET).toHaveBeenCalledWith(`/api/log/all?page=1&sort=${LOG_SORT.NEWEST}`)
  })

  it("fetches the requested page and sort", async () => {
    GET.mockResolvedValue(EMPTY_PAGE)
    await listMyLogs(2, LOG_SORT.OLDEST)
    expect(GET).toHaveBeenCalledWith(`/api/log/all?page=2&sort=${LOG_SORT.OLDEST}`)
  })

  it("returns an empty page on failure", async () => {
    GET.mockRejectedValue(new Error("boom"))
    const result = await listMyLogs()
    expect(result).toEqual(EMPTY_PAGE)
  })
})

describe("listEndorsedLogs", () => {
  it("fetches page 1 with the default sort", async () => {
    GET.mockResolvedValue(EMPTY_PAGE)
    await listEndorsedLogs()
    expect(GET).toHaveBeenCalledWith(`/api/log/endorsed?page=1&sort=${LOG_SORT.NEWEST}`)
  })

  it("fetches the requested page and sort", async () => {
    GET.mockResolvedValue(EMPTY_PAGE)
    await listEndorsedLogs(2, LOG_SORT.OLDEST)
    expect(GET).toHaveBeenCalledWith(`/api/log/endorsed?page=2&sort=${LOG_SORT.OLDEST}`)
  })

  it("returns an empty page on failure", async () => {
    GET.mockRejectedValue(new Error("boom"))
    const result = await listEndorsedLogs()
    expect(result).toEqual(EMPTY_PAGE)
  })
})
