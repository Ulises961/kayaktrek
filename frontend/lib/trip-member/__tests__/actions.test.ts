import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api/client"
import {
  getMyMembership,
  updateMyFloatPlan,
  getTripMedicalNotes,
  setTripMedicalNotes,
  revokeTripMedicalNotes,
  shareMedicalNotes,
} from "../actions"

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

const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"

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
      expect.objectContaining({ vesselLengthCm: 518 }),
    )
  })

  it("converts empty vesselLengthCm to null", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, { ...FLOAT_PLAN_FIELDS, vesselLengthCm: "" })
    expect(apiPatch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ vesselLengthCm: null }),
    )
  })

  it("revalidates the my-float-plan segment and the printable float plan on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/my-float-plan`)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/float-plan`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    expect(await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("403"))
    expect(await updateMyFloatPlan(TRIP_ID, FLOAT_PLAN_FIELDS)).toEqual({
      success: false,
      error: expect.any(String),
    })
  })
})

describe("getTripMedicalNotes", () => {
  it("POSTs to the correct path with password and elevated header", async () => {
    vi.mocked(apiPost).mockResolvedValue({ medicalNotes: "Allergic to penicillin." })
    await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(apiPost).toHaveBeenCalledWith(
      `/api/trip/${TRIP_ID}/member/me/medical-notes`,
      { password: PASSWORD },
      { "X-Elevated-Token": ELEVATED_TOKEN },
    )
  })

  it("returns the notes string on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({ medicalNotes: "Allergic to penicillin." })
    const result = await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({ success: true, notes: "Allergic to penicillin." })
  })

  it("returns null notes when none are stored", async () => {
    vi.mocked(apiPost).mockResolvedValue({ medicalNotes: null })
    const result = await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({ success: true, notes: null })
  })

  it("returns success: false on 403 (token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: expect.any(String),
    })
  })
})

describe("setTripMedicalNotes", () => {
  it("POSTs to the correct path with notes, password and elevated header", async () => {
    vi.mocked(apiPost).mockResolvedValue({ hasTripMedicalNotes: true })
    await setTripMedicalNotes(TRIP_ID, "my notes", ELEVATED_TOKEN, PASSWORD)
    expect(apiPost).toHaveBeenCalledWith(
      `/api/trip/${TRIP_ID}/member/me/medical-consent`,
      { medicalNotes: "my notes", password: PASSWORD },
      { "X-Elevated-Token": ELEVATED_TOKEN },
    )
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({ hasTripMedicalNotes: true })
    expect(await setTripMedicalNotes(TRIP_ID, "my notes", ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: true,
    })
  })

  it("returns success: false on error", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    expect(await setTripMedicalNotes(TRIP_ID, "", ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: expect.any(String),
    })
  })
})

describe("revokeTripMedicalNotes", () => {
  it("DELETEs the correct path with elevated header", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)
    expect(apiDelete).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me/medical-consent`, {
      "X-Elevated-Token": ELEVATED_TOKEN,
    })
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    expect(await revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({ success: true })
  })

  it("returns success: false on error", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    expect(await revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: expect.any(String),
    })
  })
})

describe("shareMedicalNotes", () => {
  it("POSTs to the share endpoint with password and elevated header", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(apiPost).toHaveBeenCalledWith(
      `/api/trip/${TRIP_ID}/member/me/share-medical-notes`,
      { password: PASSWORD },
      { "X-Elevated-Token": ELEVATED_TOKEN },
    )
  })

  it("revalidates the my-float-plan segment on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/my-float-plan`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    expect(await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).toEqual({ success: true })
  })

  it("returns a user-friendly error on 400 (no trip notes stored)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({ success: false, error: expect.stringMatching(/save.*notes/i) })
  })

  it("returns success: false on 403 (elevated token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: expect.any(String),
    })
  })
})
