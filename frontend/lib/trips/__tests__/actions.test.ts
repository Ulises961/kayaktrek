import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import {
  inviteUser,
  cancelInvitation,
  handleInvitation,
  createTrip,
  updateTrip,
  advanceState,
  removeMember,
  deleteTrip,
} from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const USER_ID = "01952f1a-0000-7000-8000-000000000020"
const USER_EMAIL = "paddler@example.com"

beforeEach(() => vi.clearAllMocks())

describe("inviteUser", () => {
  it("posts to the correct path with email in the body", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteUser(TRIP_ID, USER_EMAIL)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invite`, { email: USER_EMAIL })
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteUser(TRIP_ID, USER_EMAIL)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await inviteUser(TRIP_ID, USER_EMAIL)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await inviteUser(TRIP_ID, USER_EMAIL)
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

describe("createTrip", () => {
  const FIELDS = {
    destination: "Costa Brava",
    description: "5 days",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-05",
  }

  it("posts to /api/trip/create with the provided fields", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: TRIP_ID })
    await createTrip(FIELDS)
    expect(apiPost).toHaveBeenCalledWith("/api/trip/create", FIELDS)
  })

  it("returns success: true with the new tripId", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: TRIP_ID })
    const result = await createTrip(FIELDS)
    expect(result).toEqual({ success: true, tripId: TRIP_ID })
  })

  it("works with no fields (empty draft)", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: TRIP_ID })
    const result = await createTrip({})
    expect(result).toEqual({ success: true, tripId: TRIP_ID })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500"))
    const result = await createTrip(FIELDS)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateTrip", () => {
  const FIELDS = { destination: "Lofoten", dateFrom: "2026-08-01", dateTo: "2026-08-10" }

  it("patches the correct path with the provided fields", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateTrip(TRIP_ID, FIELDS)
    expect(apiPatch).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}`, FIELDS)
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateTrip(TRIP_ID, FIELDS)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    const result = await updateTrip(TRIP_ID, FIELDS)
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateTrip(TRIP_ID, FIELDS)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("advanceState", () => {
  it("posts to the correct path with the target state", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await advanceState(TRIP_ID, "planning")
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/state`, { state: "planning" })
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await advanceState(TRIP_ID, "planning")
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await advanceState(TRIP_ID, "planning")
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("removeMember", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeMember(TRIP_ID, USER_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/${USER_ID}`)
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeMember(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    const result = await removeMember(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteTrip", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTrip(TRIP_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}`)
  })

  it("redirects to /trips on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTrip(TRIP_ID)
    expect(redirect).toHaveBeenCalledWith("/trips")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    const result = await deleteTrip(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
