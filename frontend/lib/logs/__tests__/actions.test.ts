import { describe, it, expect, vi, beforeEach } from "vitest"
import { createLog, updateLog, deleteLog } from "../actions"

vi.mock("@/lib/api/client", () => ({
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
