import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { getShuttleAssignments, createShuttleAssignment, updateShuttleAssignment, deleteShuttleAssignment } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const ASSIGNMENT_ID = "01952f1a-0000-7000-8000-000000000020"
const MEMBER_ID = "01952f1a-0000-7000-8000-000000000030"

const ASSIGNMENT_FIXTURE = {
  id: ASSIGNMENT_ID,
  logisticsId: "01952f1a-0000-7000-8000-000000000040",
  tripMemberId: MEMBER_ID,
  role: "driver",
  vehicleDescription: "White Toyota",
  pickupPoint: "Harbour road",
}

beforeEach(() => vi.clearAllMocks())

describe("getShuttleAssignments", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue([ASSIGNMENT_FIXTURE])
    await getShuttleAssignments(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/shuttle/${TRIP_ID}/all`)
  })

  it("returns an array of assignments", async () => {
    vi.mocked(apiGet).mockResolvedValue([ASSIGNMENT_FIXTURE])
    const result = await getShuttleAssignments(TRIP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe("driver")
  })
})

describe("createShuttleAssignment", () => {
  it("posts to the correct path", async () => {
    vi.mocked(apiPost).mockResolvedValue(ASSIGNMENT_FIXTURE)
    await createShuttleAssignment(TRIP_ID, { tripMemberId: MEMBER_ID, role: "driver" })
    expect(apiPost).toHaveBeenCalledWith(`/api/shuttle/${TRIP_ID}/create`, { tripMemberId: MEMBER_ID, role: "driver" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(ASSIGNMENT_FIXTURE)
    await createShuttleAssignment(TRIP_ID, { tripMemberId: MEMBER_ID, role: "driver" })
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(ASSIGNMENT_FIXTURE)
    const result = await createShuttleAssignment(TRIP_ID, { tripMemberId: MEMBER_ID, role: "driver" })
    expect(result).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await createShuttleAssignment(TRIP_ID, { tripMemberId: MEMBER_ID, role: "driver" })
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("updateShuttleAssignment", () => {
  it("patches the correct assignment", async () => {
    vi.mocked(apiPatch).mockResolvedValue(ASSIGNMENT_FIXTURE)
    await updateShuttleAssignment(TRIP_ID, ASSIGNMENT_ID, { vehicleDescription: "Blue VW" })
    expect(apiPatch).toHaveBeenCalledWith(`/api/shuttle/${ASSIGNMENT_ID}`, { vehicleDescription: "Blue VW" })
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(ASSIGNMENT_FIXTURE)
    await updateShuttleAssignment(TRIP_ID, ASSIGNMENT_ID, {})
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    const result = await updateShuttleAssignment(TRIP_ID, ASSIGNMENT_ID, {})
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("deleteShuttleAssignment", () => {
  it("sends DELETE to the correct path", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteShuttleAssignment(TRIP_ID, ASSIGNMENT_ID)
    expect(apiDelete).toHaveBeenCalledWith(`/api/shuttle/${ASSIGNMENT_ID}`)
  })

  it("revalidates the trip path on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteShuttleAssignment(TRIP_ID, ASSIGNMENT_ID)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    const result = await deleteShuttleAssignment(TRIP_ID, ASSIGNMENT_ID)
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})
