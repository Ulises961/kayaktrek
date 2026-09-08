import { apiGet, apiPatch } from "../../api/client"
import { getSession } from "../../auth/session"
import { getMe, getPublicProfile, setProfileVisibility, updateProfile } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPatch: jest.fn(),
}))
jest.mock("../../auth/session", () => ({
  getSession: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPatch = apiPatch as jest.Mock
const mockGetSession = getSession as jest.Mock

const VALID_USER = { mail: "a@example.com", username: "sea_otter", name: "Ada" }
const VALID_PUBLIC_USER = {
  username: "sea_otter",
  name: "Ada",
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
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPatch.mockReset()
  mockGetSession.mockReset()
})

describe("getMe", () => {
  it("hits GET /api/user/me", async () => {
    mockApiGet.mockResolvedValue(VALID_USER)
    await getMe()
    expect(mockApiGet).toHaveBeenCalledWith("/api/user/me")
  })

  it("propagates a thrown network error unchanged", async () => {
    mockApiGet.mockRejectedValue(new Error("Network request failed"))
    await expect(getMe()).rejects.toThrow("Network request failed")
  })

  it("throws at the Zod boundary when a required field is missing", async () => {
    mockApiGet.mockResolvedValue({ username: "sea_otter" })
    await expect(getMe()).rejects.toThrow()
  })
})

describe("getPublicProfile", () => {
  it("hits GET /api/user/<username>/public and returns the parsed profile", async () => {
    mockApiGet.mockResolvedValue(VALID_PUBLIC_USER)
    const profile = await getPublicProfile("sea_otter")
    expect(mockApiGet).toHaveBeenCalledWith("/api/user/sea_otter/public")
    expect(profile?.username).toBe("sea_otter")
  })

  // The consequence that matters: web's undifferentiated-404 privacy rule (missing, inactive,
  // deletion-pending, and non-public all read identically) only holds if a 404 becomes `null`,
  // not a thrown error the screen has to special-case.
  it("returns null, not a thrown error, for a 404/non-public profile", async () => {
    mockApiGet.mockRejectedValue(new Error("GET /api/user/ghost/public failed: 404"))
    await expect(getPublicProfile("ghost")).resolves.toBeNull()
  })

  it("returns null when the response is malformed rather than throwing", async () => {
    mockApiGet.mockResolvedValue({ username: "sea_otter" })
    await expect(getPublicProfile("sea_otter")).resolves.toBeNull()
  })
})

describe("updateProfile", () => {
  it("throws when there is no session, without calling the API", async () => {
    mockGetSession.mockResolvedValue(null)
    await expect(
      updateProfile({ name: "Ada", username: "sea_otter" }),
    ).rejects.toThrow("Not signed in")
    expect(mockApiPatch).not.toHaveBeenCalled()
  })

  it("patches /api/user/<id> with only the identity fields, coercing blanks to null", async () => {
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "a@example.com" })
    mockApiPatch.mockResolvedValue(VALID_USER)
    await updateProfile({ name: "Ada", username: "sea_otter", bio: "", homeLocation: null })
    expect(mockApiPatch).toHaveBeenCalledWith("/api/user/user-1", {
      name: "Ada",
      surname: null,
      username: "sea_otter",
      bio: null,
      homeLocation: null,
    })
  })

  it("propagates a thrown 409 (username taken) error unchanged", async () => {
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "a@example.com" })
    mockApiPatch.mockRejectedValue(new Error("That username is already taken."))
    await expect(
      updateProfile({ name: "Ada", username: "taken" }),
    ).rejects.toThrow("already taken")
  })
})

describe("setProfileVisibility", () => {
  it("patches only profileIsPublic", async () => {
    mockGetSession.mockResolvedValue({ userId: "user-1", email: "a@example.com" })
    mockApiPatch.mockResolvedValue(VALID_USER)
    await setProfileVisibility(true)
    expect(mockApiPatch).toHaveBeenCalledWith("/api/user/user-1", { profileIsPublic: true })
  })
})
