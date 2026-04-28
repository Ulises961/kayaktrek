import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { apiPost, apiDelete } from "@/lib/api/client"
import { inviteUser, cancelInvitation, handleInvitation } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const USER_ID = "01952f1a-0000-7000-8000-000000000020"

beforeEach(() => vi.clearAllMocks())

describe("inviteUser", () => {
  it("posts to the correct path with userId in the body", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteUser(TRIP_ID, USER_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invite`, { userId: USER_ID })
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteUser(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await inviteUser(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await inviteUser(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("cancelInvitation", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await cancelInvitation(TRIP_ID, USER_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invite/${USER_ID}`)
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await cancelInvitation(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await cancelInvitation(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("handleInvitation", () => {
  it("posts accepted: true to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await handleInvitation(TRIP_ID, true)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invitation`, { accepted: true })
  })

  it("posts accepted: false when declining", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await handleInvitation(TRIP_ID, false)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invitation`, { accepted: false })
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await handleInvitation(TRIP_ID, true)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    const result = await handleInvitation(TRIP_ID, true)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
