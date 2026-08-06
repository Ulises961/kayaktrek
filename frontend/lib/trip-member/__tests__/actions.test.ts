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
import { apiGet, apiPatch, apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import {
  getMyMembership,
  updateMyFloatPlan,
  getTripMedicalNotes,
  setTripMedicalNotes,
  revokeTripMedicalNotes,
  shareMedicalNotes,
  readMemberMedicalNotes,
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

  it("rethrows a redirect signal instead of swallowing it into null", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(getMyMembership(TRIP_ID)).rejects.toBe(redirectError)
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
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/float-plan/${TRIP_ID}`)
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

  it("returns success: false on 403 (elevated token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: "Session expired. Please lock and unlock again.",
    })
  })

  it("returns a decrypt-failure message on 401 (wrong password)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("401"))
    const result = await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/could not decrypt/i),
    })
  })

  it("returns a message including the failure detail for other errors", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500"))
    const result = await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: "Failed to load medical notes (500).",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).rejects.toBe(redirectError)
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

  it("returns a generic message on non-403 errors", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    expect(await setTripMedicalNotes(TRIP_ID, "", ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: "Failed to save medical notes.",
    })
  })

  it("returns a session-expired message on 403 (elevated token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await setTripMedicalNotes(TRIP_ID, "my notes", ELEVATED_TOKEN, PASSWORD)).toEqual({
      success: false,
      error: "Session expired. Please lock and unlock again.",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(setTripMedicalNotes(TRIP_ID, "my notes", ELEVATED_TOKEN, PASSWORD)).rejects.toBe(
      redirectError,
    )
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

  it("returns a session-expired message on 403 (elevated token expired)", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("403"))
    expect(await revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Session expired. Please lock and unlock again.",
    })
  })

  it("returns a generic message on non-403 errors", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("500"))
    expect(await revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Failed to delete medical notes.",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiDelete).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(revokeTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).rejects.toBe(redirectError)
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
      error: "Session expired. Please try again.",
    })
  })

  it("returns a decrypt-failure message on 401 (wrong password)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("401"))
    const result = await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/could not decrypt/i),
    })
  })

  it("returns a message including the failure detail for other errors", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500"))
    const result = await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: "Failed to share medical notes (500).",
    })
  })

  it("does not revalidate when sharing fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, PASSWORD)).rejects.toBe(redirectError)
  })
})

describe("readMemberMedicalNotes", () => {
  const MEMBER_ID = "01952f1a-0000-7000-8000-000000000030"

  it("re-authenticates then fetches the member's notes with the elevated token", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ elevatedToken: ELEVATED_TOKEN })
      .mockResolvedValueOnce({ medicalNotes: "Allergic to penicillin." })
    await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/user/me/re-auth", { password: PASSWORD })
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      `/api/trip/${TRIP_ID}/member/${MEMBER_ID}/medical-notes`,
      { password: PASSWORD },
      { "X-Elevated-Token": ELEVATED_TOKEN },
    )
  })

  it("returns the decrypted notes on success", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ elevatedToken: ELEVATED_TOKEN })
      .mockResolvedValueOnce({ medicalNotes: "Allergic to penicillin." })
    const result = await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(result).toEqual({ success: true, medicalNotes: "Allergic to penicillin." })
  })

  it("returns 'Incorrect password.' on 401 (wrong password)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("401"))
    const result = await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(result).toEqual({ success: false, error: "Incorrect password." })
  })

  it("short-circuits after a failed re-auth — never calls the notes endpoint", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("401"))
    await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(apiPost).toHaveBeenCalledTimes(1)
  })

  it("returns a leader-only message on 403 (not the trip leader)", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ elevatedToken: ELEVATED_TOKEN })
      .mockRejectedValueOnce(new Error("403"))
    const result = await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: "Only the trip leader can read shared notes.",
    })
  })

  it("returns a not-shared message on 404 (member hasn't shared notes)", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ elevatedToken: ELEVATED_TOKEN })
      .mockRejectedValueOnce(new Error("404"))
    const result = await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(result).toEqual({
      success: false,
      error: "No shared notes for this member.",
    })
  })

  it("returns a generic message for other failures", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ elevatedToken: ELEVATED_TOKEN })
      .mockRejectedValueOnce(new Error("500"))
    const result = await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)
    expect(result).toEqual({ success: false, error: "Failed to read medical notes." })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(readMemberMedicalNotes(TRIP_ID, MEMBER_ID, PASSWORD)).rejects.toBe(redirectError)
  })
})
