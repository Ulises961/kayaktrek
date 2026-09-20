import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/client"
import {
  changePassword,
  reAuthenticate,
  requestAccountDeletion,
  requestDataExport,
  requestEmailChange,
  setPhone,
} from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}))
jest.mock("../../auth/session", () => ({
  getSession: jest.fn().mockResolvedValue({ userId: "user-1" }),
}))

const mockApiPost = apiPost as jest.Mock
const mockApiPatch = apiPatch as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

// setPhone parses its response through UserSchema, so the mock has to return something
// the schema accepts — returning {} would fail the parse rather than the assertion.
const A_USER = {
  mail: "paddler@example.com",
  username: "paddler",
  name: "Paddler",
  phone: "+44 7700 900000",
}

beforeEach(() => {
  ;(apiGet as jest.Mock).mockReset()
  mockApiPost.mockReset()
  mockApiPatch.mockReset()
  mockApiDelete.mockReset()
})

describe("setPhone", () => {
  it("patches the trimmed number onto the current user", async () => {
    mockApiPatch.mockResolvedValue(A_USER)

    await setPhone("  +44 7700 900000  ")

    expect(mockApiPatch).toHaveBeenCalledWith("/api/user/user-1", { phone: "+44 7700 900000" })
  })

  it("sends null to clear the number rather than an empty string", async () => {
    // An empty string is a value the column would store; null is the absence the
    // backend's validator expects for "no phone".
    mockApiPatch.mockResolvedValue({ ...A_USER, phone: null })

    await setPhone("   ")

    expect(mockApiPatch).toHaveBeenCalledWith("/api/user/user-1", { phone: null })
  })
})

describe("changePassword", () => {
  it("sends the current and new passwords to the password endpoint", async () => {
    mockApiPatch.mockResolvedValue({})

    await changePassword("old-one", "new-one")

    expect(mockApiPatch).toHaveBeenCalledWith("/api/user/me/password", {
      currentPwd: "old-one",
      newPwd: "new-one",
    })
  })

  it("propagates the backend's rejection message unchanged", async () => {
    mockApiPatch.mockRejectedValue(new Error("Current password is incorrect."))

    await expect(changePassword("wrong", "new-one")).rejects.toThrow(
      "Current password is incorrect.",
    )
  })
})

describe("reAuthenticate", () => {
  it("exchanges the password for a short-lived elevated token", async () => {
    mockApiPost.mockResolvedValue({ elevatedToken: "elevated-abc" })

    await expect(reAuthenticate("correct-horse")).resolves.toBe("elevated-abc")
    expect(mockApiPost).toHaveBeenCalledWith("/api/user/me/re-auth", {
      password: "correct-horse",
    })
  })
})

describe("requestEmailChange", () => {
  it("carries the elevated token as a header, not in the body", async () => {
    // The endpoint reads X-Elevated-Token; putting it in the body would be silently
    // ignored and the request rejected as un-elevated.
    mockApiPost.mockResolvedValue({})

    await requestEmailChange("elevated-abc", "new@example.com")

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/user/me/email-change",
      { newMail: "new@example.com" },
      { "X-Elevated-Token": "elevated-abc" },
    )
  })
})

describe("requestDataExport", () => {
  it("posts to the export endpoint", async () => {
    mockApiPost.mockResolvedValue({})

    await requestDataExport()

    expect(mockApiPost).toHaveBeenCalledWith("/api/user/me/data-export", {})
  })

  it("propagates the once-per-day rate limit message", async () => {
    mockApiPost.mockRejectedValue(new Error("You can only request a data export once per day."))

    await expect(requestDataExport()).rejects.toThrow("once per day")
  })
})

describe("requestAccountDeletion", () => {
  it("deletes the current user", async () => {
    mockApiDelete.mockResolvedValue(undefined)

    await requestAccountDeletion()

    expect(mockApiDelete).toHaveBeenCalledWith("/api/user/me")
  })
})
