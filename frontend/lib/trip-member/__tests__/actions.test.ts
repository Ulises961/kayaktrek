import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch } from "@/lib/api/client"
import { getMyMembership, updateMyFloatPlan } from "../actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"

const MEMBER_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000020",
  role: "crew",
  user: {
    id: "01952f1a-0000-7000-8000-000000000001",
    mail: "ada@example.com",
    username: "ada",
    name: "Ada",
  },
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: 518,
}

const FLOAT_PLAN_FIELDS = {
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: "518",
  emergencyContactName: "Grace Hopper",
  emergencyContactPhone: "+34600000002",
}

beforeEach(() => vi.clearAllMocks())

describe("getMyMembership", () => {
  it("fetches from the correct path", async () => {
    vi.mocked(apiGet).mockResolvedValue(MEMBER_FIXTURE)
    await getMyMembership(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me`)
  })

  it("returns the parsed TripMember on success", async () => {
    vi.mocked(apiGet).mockResolvedValue(MEMBER_FIXTURE)
    const result = await getMyMembership(TRIP_ID)
    expect(result?.role).toBe("crew")
    expect(result?.vesselMake).toBe("Wilderness Systems")
  })

  it("returns null when the API throws", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("404"))
    expect(await getMyMembership(TRIP_ID)).toBeNull()
  })
})

describe("updateMyFloatPlan", () => {
  it("patches the correct path", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)
    expect(apiPatch).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me`, expect.any(Object))
  })

  it("converts string vesselLengthCm to a number", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)
    expect(apiPatch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ vesselLengthCm: 518 })
    )
  })

  it("converts empty vesselLengthCm to null", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, { ...FLOAT_PLAN_FIELDS, vesselLengthCm: "" })
    expect(apiPatch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ vesselLengthCm: null })
    )
  })

  it("revalidates the trip detail path on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    expect(await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    expect(await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)).toEqual({ success: false, error: expect.any(String) })
  })
})
