import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPatch, apiPost, apiPut, apiDelete, isRedirectError } from "@/lib/api/client"
import {
  getMyMembership,
  updateMyFloatPlan,
  setSatelliteTracking,
  getTripMedicalNotes,
  setTripMedicalNotes,
  revokeTripMedicalNotes,
  getLeaderPublicKey,
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

// Opaque to these tests on purpose: the actions are transport since M22 and must not
// interpret, re-shape or validate what the browser sealed.
const SEALED = { ciphertext: "Y3Q=", nonce: "bm9uY2U=", salt: "c2FsdA==" }
const SEALED_FOR_LEADER = { ciphertext: "Y3Q=", nonce: "bm9uY2U=", ephemeralKey: "ZXBo" }

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

describe("setSatelliteTracking", () => {
  it.each([true, false])("PUTs enabled=%s to the satellite-tracking path", async (enabled) => {
    vi.mocked(apiPut).mockResolvedValue(MEMBER_FIXTURE)
    await setSatelliteTracking(TRIP_ID, enabled)
    expect(apiPut).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me/satellite-tracking`, {
      enabled,
    })
  })

  it("revalidates the trip layout on success: the switch lives in the header it renders", async () => {
    vi.mocked(apiPut).mockResolvedValue(MEMBER_FIXTURE)
    await setSatelliteTracking(TRIP_ID, true)
    expect(revalidatePath).toHaveBeenCalledWith("/trips/[id]", "layout")
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPut).mockResolvedValue(MEMBER_FIXTURE)
    expect(await setSatelliteTracking(TRIP_ID, true)).toEqual({ success: true })
  })

  it("returns the server's refusal message so the paddler sees why", async () => {
    vi.mocked(apiPut).mockRejectedValue(new Error("Register your inReach feed in Settings first."))
    expect(await setSatelliteTracking(TRIP_ID, true)).toEqual({
      success: false,
      error: "Register your inReach feed in Settings first.",
    })
  })

  it("does not revalidate when the request failed", async () => {
    vi.mocked(apiPut).mockRejectedValue(new Error("409"))
    await setSatelliteTracking(TRIP_ID, true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("falls back to a generic message when the thrown value is not an Error", async () => {
    vi.mocked(apiPut).mockRejectedValue("boom")
    expect(await setSatelliteTracking(TRIP_ID, true)).toEqual({
      success: false,
      error: "Failed to update inReach sharing.",
    })
  })

  it("rethrows a redirect signal instead of reporting a failure", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPut).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(setSatelliteTracking(TRIP_ID, true)).rejects.toBe(redirectError)
  })
})

describe("getTripMedicalNotes", () => {
  it("GETs the correct path with the elevated header and no password", async () => {
    vi.mocked(apiGet).mockResolvedValue(SEALED)
    await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me/medical-notes`, {
      "X-Elevated-Token": ELEVATED_TOKEN,
    })
  })

  it("returns the sealed blob for the caller to decrypt", async () => {
    vi.mocked(apiGet).mockResolvedValue(SEALED)
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: true,
      sealed: SEALED,
    })
  })

  it("returns sealed: null when none are stored — the backend sends nulls, not a 404", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ciphertext: null, nonce: null, salt: null })
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: true,
      sealed: null,
    })
  })

  it("returns success: false on 403 (elevated token expired)", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("403"))
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Session expired. Please lock and unlock again.",
    })
  })

  it("returns a message including the failure detail for other errors", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("500"))
    expect(await getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Failed to load medical notes (500).",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(getTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN)).rejects.toBe(redirectError)
  })
})

describe("setTripMedicalNotes", () => {
  it("POSTs the sealed blob, never the notes or the password", async () => {
    vi.mocked(apiPost).mockResolvedValue({ hasTripMedicalNotes: true })
    await setTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED)
    expect(apiPost).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me/medical-consent`, SEALED, {
      "X-Elevated-Token": ELEVATED_TOKEN,
    })
    expect(JSON.stringify(vi.mocked(apiPost).mock.calls)).not.toContain(PASSWORD)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({ hasTripMedicalNotes: true })
    expect(await setTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED)).toEqual({ success: true })
  })

  it("returns a generic message on non-403 errors", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    expect(await setTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED)).toEqual({
      success: false,
      error: "Failed to save medical notes.",
    })
  })

  it("returns a session-expired message on 403 (elevated token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await setTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED)).toEqual({
      success: false,
      error: "Session expired. Please lock and unlock again.",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(setTripMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED)).rejects.toBe(redirectError)
  })
})

describe("getLeaderPublicKey", () => {
  it("GETs the leader's public key with no elevated token — it is public material", async () => {
    vi.mocked(apiGet).mockResolvedValue({ publicKey: "cGs=" })
    await getLeaderPublicKey(TRIP_ID)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/me/leader-public-key`)
  })

  it("returns the key so the caller can seal for the leader locally", async () => {
    vi.mocked(apiGet).mockResolvedValue({ publicKey: "cGs=" })
    expect(await getLeaderPublicKey(TRIP_ID)).toEqual({ success: true, publicKey: "cGs=" })
  })

  it("explains the leader has no keypair on 400, rather than leaking the status", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("400"))
    expect(await getLeaderPublicKey(TRIP_ID)).toEqual({
      success: false,
      error: expect.stringMatching(/leader/i),
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(getLeaderPublicKey(TRIP_ID)).rejects.toBe(redirectError)
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
  it("POSTs the leader-sealed blob, never the notes or the password", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)
    expect(apiPost).toHaveBeenCalledWith(
      `/api/trip/${TRIP_ID}/member/me/share-medical-notes`,
      SEALED_FOR_LEADER,
      { "X-Elevated-Token": ELEVATED_TOKEN },
    )
    expect(JSON.stringify(vi.mocked(apiPost).mock.calls)).not.toContain(PASSWORD)
  })

  it("revalidates the my-float-plan segment on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}/my-float-plan`)
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue({})
    expect(await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)).toEqual({
      success: true,
    })
  })

  it("returns a user-friendly error on 400 (no trip notes stored)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("400"))
    const result = await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)
    expect(result).toEqual({ success: false, error: expect.stringMatching(/save.*notes/i) })
  })

  it("returns success: false on 403 (elevated token expired)", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    expect(await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)).toEqual({
      success: false,
      error: "Session expired. Please try again.",
    })
  })

  it("returns a message including the failure detail for other errors", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500"))
    expect(await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)).toEqual({
      success: false,
      error: "Failed to share medical notes (500).",
    })
  })

  it("does not revalidate when sharing fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("403"))
    await shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiPost).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(shareMedicalNotes(TRIP_ID, ELEVATED_TOKEN, SEALED_FOR_LEADER)).rejects.toBe(
      redirectError,
    )
  })
})

describe("readMemberMedicalNotes", () => {
  const MEMBER_ID = "01952f1a-0000-7000-8000-000000000030"

  it("GETs the member's sealed notes with the caller's elevated token", async () => {
    vi.mocked(apiGet).mockResolvedValue(SEALED_FOR_LEADER)
    await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)
    expect(apiGet).toHaveBeenCalledWith(`/api/trip/${TRIP_ID}/member/${MEMBER_ID}/medical-notes`, {
      "X-Elevated-Token": ELEVATED_TOKEN,
    })
  })

  it("returns the sealed blob for the leader's own client to decrypt", async () => {
    vi.mocked(apiGet).mockResolvedValue(SEALED_FOR_LEADER)
    expect(await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)).toEqual({
      success: true,
      sealed: SEALED_FOR_LEADER,
    })
  })

  it("returns a leader-only message on 403 (not the trip leader)", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("403"))
    expect(await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Only the trip leader can read shared notes.",
    })
  })

  it("returns a not-shared message on 404 (member hasn't shared notes)", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("404"))
    expect(await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "No shared notes for this member.",
    })
  })

  it("returns a generic message for other failures", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("500"))
    expect(await readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)).toEqual({
      success: false,
      error: "Failed to read medical notes.",
    })
  })

  it("rethrows a redirect signal instead of returning a failure result", async () => {
    const redirectError = new Error("NEXT_REDIRECT")
    vi.mocked(apiGet).mockRejectedValue(redirectError)
    vi.mocked(isRedirectError).mockReturnValueOnce(true)
    await expect(readMemberMedicalNotes(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)).rejects.toBe(
      redirectError,
    )
  })
})
