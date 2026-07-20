import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TRIP_STATE, TRIP_SORT } from "@/lib/dtos/trip"
import {
  cancelInvitation,
  handleInvitation,
  createTrip,
  updateTrip,
  advanceState,
  removeMember,
  deleteTripForEveryone,
  leaveTrip,
  nominateSuccessor,
  clearNomination,
  claimLeadership,
  listTrips,
  listTripInvitations,
} from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const USER_ID = "01952f1a-0000-7000-8000-000000000020"

beforeEach(() => vi.clearAllMocks())

describe("cancelInvitation", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await cancelInvitation(TRIP_ID, USER_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invite/${USER_ID}`)
  })

  it("revalidates the crew segment on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await cancelInvitation(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/crew`)
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

  it("revalidates the trip layout (travellers shown in the header) on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await handleInvitation(TRIP_ID, true)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
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

  it("revalidates the trip layout (header shows destination/dates/difficulty) on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateTrip(TRIP_ID, FIELDS)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
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

  it("revalidates the trip layout (header shows the state badge/timeline) on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await advanceState(TRIP_ID, "planning")
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
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

  it("revalidates the trip layout (header avatar cluster + crew segment) on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeMember(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    const result = await removeMember(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteTripForEveryone", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTripForEveryone(TRIP_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}`)
  })

  it("redirects to /trips on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteTripForEveryone(TRIP_ID)
    expect(redirect).toHaveBeenCalledWith("/trips")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    const result = await deleteTripForEveryone(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("leaveTrip", () => {
  it("sends POST to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await leaveTrip(TRIP_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/leave`, {})
  })

  it("redirects to /trips on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await leaveTrip(TRIP_ID)
    expect(redirect).toHaveBeenCalledWith("/trips")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("404"))
    const result = await leaveTrip(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("nominateSuccessor", () => {
  it("sends POST to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await nominateSuccessor(TRIP_ID, USER_ID)
    expect(apiPost).toHaveBeenCalledWith(
      `/api/trip/${TRIP_ID}/member/${USER_ID}/nominate-successor`,
      {},
    )
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await nominateSuccessor(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await nominateSuccessor(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("clearNomination", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await clearNomination(TRIP_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/nominate-successor`)
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await clearNomination(TRIP_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    const result = await clearNomination(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("claimLeadership", () => {
  it("sends POST to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await claimLeadership(TRIP_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/claim-leadership`, {})
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await claimLeadership(TRIP_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await claimLeadership(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("listTrips", () => {
  const SESSION = { userId: USER_ID, email: "paddler@example.com", isAdmin: false }
  const EMPTY_PAGE = { items: [], total: 0, page: 1, pages: 1 }

  it("returns an empty page and never calls the API when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const result = await listTrips({})
    expect(result).toEqual(EMPTY_PAGE)
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("fetches page 1 against the session's own user id by default", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockResolvedValue(EMPTY_PAGE)
    await listTrips({})
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${USER_ID}/all?page=1`)
  })

  it("includes state, sort, difficulty and the distance range when provided", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockResolvedValue(EMPTY_PAGE)
    await listTrips({
      state: TRIP_STATE.BUILDING,
      sort: TRIP_SORT.SOONEST,
      difficulty: "easy",
      minMiles: 5,
      maxMiles: 50,
      page: 2,
    })
    expect(apiGet).toHaveBeenCalledWith(
      `/api/trip/${USER_ID}/all?page=2&state=building&sort=soonest&difficulty=easy&min_miles=5&max_miles=50`,
    )
  })

  it("returns an empty page on failure", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    const result = await listTrips({})
    expect(result).toEqual(EMPTY_PAGE)
  })
})

describe("listTripInvitations", () => {
  it("fetches the given user's outstanding crew invitations", async () => {
    vi.mocked(apiGet).mockResolvedValue([{ id: TRIP_ID, destination: "Fjords" }])
    const result = await listTripInvitations(USER_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${USER_ID}/invitations`)
    expect(result).toEqual([expect.objectContaining({ id: TRIP_ID, destination: "Fjords" })])
  })

  it("returns an empty array when the response isn't an array", async () => {
    vi.mocked(apiGet).mockResolvedValue(null)
    const result = await listTripInvitations(USER_ID)
    expect(result).toEqual([])
  })

  it("returns an empty array on failure", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    const result = await listTripInvitations(USER_ID)
    expect(result).toEqual([])
  })
})
