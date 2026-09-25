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
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TRIP_STATE, TRIP_SORT } from "@/lib/dtos/trip"
import {
  cancelInvitation,
  handleInvitation,
  createTrip,
  updateTrip,
  advanceState,
  pauseTrip,
  resumeTrip,
  abortTrip,
  removeMember,
  deleteTripForEveryone,
  leaveTrip,
  nominateSuccessor,
  clearNomination,
  claimLeadership,
  getTripCrew,
  inviteBuddy,
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

  it("does not revalidate when the transition is rejected", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    await advanceState(TRIP_ID, "planning")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(advanceState(TRIP_ID, "planning")).rejects.toBe(redirectError)
  })
})

describe("pauseTrip", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await pauseTrip(TRIP_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/pause`, {})
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await pauseTrip(TRIP_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await pauseTrip(TRIP_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("resumeTrip", () => {
  it("posts the resume date to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await resumeTrip(TRIP_ID, "2026-08-01")
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/resume`, {
      resumeDate: "2026-08-01",
    })
  })

  it("omits resumeDate when not provided", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await resumeTrip(TRIP_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/resume`, {})
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await resumeTrip(TRIP_ID, "2026-08-01")
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await resumeTrip(TRIP_ID, "2026-08-01")
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("abortTrip", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await abortTrip(TRIP_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/abort`, {})
  })

  it("revalidates the trip layout on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await abortTrip(TRIP_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("409"))
    const result = await abortTrip(TRIP_ID)
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

  it("does not redirect when the delete fails", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    await deleteTripForEveryone(TRIP_ID)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiDelete).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(deleteTripForEveryone(TRIP_ID)).rejects.toBe(redirectError)
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

describe("getTripCrew", () => {
  const CREW_MEMBER = {
    id: USER_ID,
    role: "crew",
    user: {
      id: USER_ID,
      mail: "ada@example.com",
      username: "ada",
      name: "Ada",
    },
  }

  it("fetches the trip and returns its travellers", async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: TRIP_ID, travellers: [CREW_MEMBER] })
    const result = await getTripCrew(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}`)
    expect(result).toEqual([expect.objectContaining({ id: USER_ID, role: "crew" })])
  })

  it("returns an empty array when the trip has no travellers", async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: TRIP_ID })
    const result = await getTripCrew(TRIP_ID)
    expect(result).toEqual([])
  })

  it("returns an empty array when the API throws", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("404"))
    const result = await getTripCrew(TRIP_ID)
    expect(result).toEqual([])
  })

  it("rethrows a redirect signal instead of swallowing it into an empty list", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(getTripCrew(TRIP_ID)).rejects.toBe(redirectError)
  })
})

describe("inviteBuddy", () => {
  it("posts the invitee's userId to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteBuddy(TRIP_ID, USER_ID)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/invite`, { userId: USER_ID })
  })

  it("revalidates the crew segment on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await inviteBuddy(TRIP_ID, USER_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/crew`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await inviteBuddy(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: true })
  })

  it("returns a user-friendly message when the invite is forbidden (blocked/ineligible paddler)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    const result = await inviteBuddy(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: "You can't invite this paddler." })
  })

  it("returns the raw error message for non-403 failures", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500 Internal Server Error"))
    const result = await inviteBuddy(TRIP_ID, USER_ID)
    expect(result).toEqual({ success: false, error: "500 Internal Server Error" })
  })

  it("does not revalidate when the invite fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    await inviteBuddy(TRIP_ID, USER_ID)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rethrows a redirect signal instead of swallowing it into a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(inviteBuddy(TRIP_ID, USER_ID)).rejects.toBe(redirectError)
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

  it("rethrows a failed fetch instead of reporting the user has no trips", async () => {
    const failure = new Error("boom")
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockRejectedValue(failure)
    await expect(listTrips({})).rejects.toBe(failure)
  })

  it("rethrows a response that fails the schema instead of reporting the user has no trips", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ id: "not-a-uuid" }],
      total: 1,
      page: 1,
      pages: 1,
    })
    await expect(listTrips({})).rejects.toMatchObject({ name: "ZodError" })
  })

  it("rethrows a redirect signal instead of returning an empty page", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(getSession).mockResolvedValue(SESSION)
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    await expect(listTrips({})).rejects.toBe(redirectError)
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
