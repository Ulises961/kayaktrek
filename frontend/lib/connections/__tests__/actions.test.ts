import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { apiGet, apiPost, apiDelete } from "@/lib/api/client"
import {
  searchPaddlers,
  listConnections,
  requestConnection,
  acceptConnection,
  removeConnection,
  getRelationship,
} from "../actions"

const PADDLER = {
  id: "01952f1a-0000-7000-8000-000000000003",
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: null,
  bio: null,
  homeLocation: null,
  certifications: [],
  stats: {
    totalDistance: 0,
    totalHours: 0,
    logCount: 0,
    tripCount: 0,
    endorsementsReceived: 0,
    conditionsDistribution: {},
    activityByMonth: [],
  },
  relationship: "none",
  connectionId: null,
}

beforeEach(() => vi.clearAllMocks())

describe("searchPaddlers", () => {
  it("encodes the term and page into the query", async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, page: 2, pages: 1 })
    await searchPaddlers("ma ren", 2)
    expect(apiGet).toHaveBeenCalledWith("/api/user/search/paddlers?q=ma+ren&page=2")
  })

  it("returns an empty page when the request fails", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    const page = await searchPaddlers("maren")
    expect(page).toEqual({ items: [], total: 0, page: 1, pages: 1 })
  })
})

describe("listConnections", () => {
  it("appends the status filter when given", async () => {
    vi.mocked(apiGet).mockResolvedValue([])
    await listConnections("accepted")
    expect(apiGet).toHaveBeenCalledWith("/api/connections?status=accepted")
  })

  it("omits the query when no status is given", async () => {
    vi.mocked(apiGet).mockResolvedValue([])
    await listConnections()
    expect(apiGet).toHaveBeenCalledWith("/api/connections")
  })
})

describe("requestConnection", () => {
  it("posts the addressee identifiers and revalidates", async () => {
    const { revalidatePath } = await import("next/cache")
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await requestConnection({ username: "seapaddler" })
    expect(apiPost).toHaveBeenCalledWith("/api/connections/request", {
      addresseeUsername: "seapaddler",
      addresseeId: undefined,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/paddlers")
    expect(result).toEqual({ success: true })
  })

  it("maps a 409 to a duplicate-connection message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 409"))
    const result = await requestConnection({ username: "seapaddler" })
    expect(result).toEqual({
      success: false,
      error: "You already have a connection with this paddler.",
    })
  })

  it("maps a 404 to a not-found message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 404"))
    const result = await requestConnection({ username: "ghost" })
    expect(result).toEqual({ success: false, error: "That paddler could not be found." })
  })

  it("returns a generic error for other failures", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Internal Server Error"))
    const result = await requestConnection({ username: "seapaddler" })
    expect(result).toEqual({ success: false, error: "Failed to send buddy request." })
  })
})

describe("acceptConnection / removeConnection", () => {
  it("accepts by connection id and revalidates", async () => {
    const { revalidatePath } = await import("next/cache")
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await acceptConnection("abc")
    expect(apiPost).toHaveBeenCalledWith("/api/connections/abc/accept", {})
    expect(revalidatePath).toHaveBeenCalledWith("/paddlers")
    expect(result).toEqual({ success: true })
  })

  it("returns an error when accepting fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Not found"))
    const result = await acceptConnection("abc")
    expect(result).toEqual({ success: false, error: "Failed to accept buddy request." })
  })

  it("removes by connection id and revalidates", async () => {
    const { revalidatePath } = await import("next/cache")
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    const result = await removeConnection("abc")
    expect(apiDelete).toHaveBeenCalledWith("/api/connections/abc")
    expect(revalidatePath).toHaveBeenCalledWith("/paddlers")
    expect(result).toEqual({ success: true })
  })

  it("returns an error when removing fails", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("Not found"))
    const result = await removeConnection("abc")
    expect(result).toEqual({ success: false, error: "Failed to remove connection." })
  })
})

describe("getRelationship", () => {
  it("returns the relationship for the matching username", async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [PADDLER], total: 1, page: 1, pages: 1 })
    const result = await getRelationship("seapaddler")
    expect(result).toEqual({
      relationship: "none",
      connectionId: null,
      userId: "01952f1a-0000-7000-8000-000000000003",
    })
  })

  it("returns null when the search has no matching username (self/blocked/private)", async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
    const result = await getRelationship("seapaddler")
    expect(result).toBeNull()
  })
})
