import { describe, it, expect, vi, beforeEach } from "vitest"
import { createLog, updateLog, deleteLog, endorseLog, unendorseLog } from "../actions"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

import { apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

const POST = apiPost as ReturnType<typeof vi.fn>
const PATCH = apiPatch as ReturnType<typeof vi.fn>
const DELETE = apiDelete as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe("createLog", () => {
  it("posts to /api/log/create with fields", async () => {
    POST.mockResolvedValue({ id: "abc" })
    const result = await createLog({ date: "2026-07-01", hours: 5 })
    expect(POST).toHaveBeenCalledWith("/api/log/create", { date: "2026-07-01", hours: 5 })
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
  it("deletes /api/log/:id and redirects", async () => {
    DELETE.mockResolvedValue({})
    await deleteLog("log-1")
    expect(DELETE).toHaveBeenCalledWith("/api/log/log-1")
    expect(redirect).toHaveBeenCalledWith("/logs")
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
