import { API_PREFIX, API_URL } from "../../api/config"
import {
  DELETION_PENDING,
  INVALID_CREDENTIALS,
  login,
  logoutEverywhere,
  register,
} from "../actions"
import { clearBiometricCredentials } from "../biometric-store"
import { clearTokens, getAccessToken, setTokens } from "../token-store"

jest.mock("../token-store", () => ({
  getAccessToken: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}))
jest.mock("../biometric-store", () => ({ clearBiometricCredentials: jest.fn() }))

const mockFetch = jest.fn()

function respond(status: number, body: unknown = {}) {
  mockFetch.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })
}

describe("auth actions", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    ;(setTokens as jest.Mock).mockReset()
    ;(clearTokens as jest.Mock).mockReset().mockResolvedValue(undefined)
    ;(clearBiometricCredentials as jest.Mock).mockReset().mockResolvedValue(undefined)
    ;(getAccessToken as jest.Mock).mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
  })

  describe("register", () => {
    it("posts the address, username and password under the backend's field names", async () => {
      respond(201)

      const result = await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")

      expect(result).toEqual({ success: true })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}${API_PREFIX}/auth/register`)
      expect(JSON.parse(init.body)).toEqual({
        mail: "paddler@example.com",
        username: "paddler_1",
        pwd: "Correct-Horse-9!",
      })
    })

    it("explains a closed sign-up rather than a bare refusal", async () => {
      respond(403, { code: "invalid_invite_code" })

      expect(await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")).toEqual({
        success: false,
        error: "Sign-ups are closed right now.",
        code: "invalid_invite_code",
      })
    })

    it("falls back to a plain refusal for any other 403", async () => {
      respond(403, {})

      expect(await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")).toEqual({
        success: false,
        error: "Access denied.",
      })
    })

    it("tells the user their details were not accepted on a validation failure", async () => {
      respond(422, { errors: {} })

      const result = await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")

      expect(result).toEqual({
        success: false,
        error: "Some details were not accepted. Check them and try again.",
      })
    })

    it("tells the user to wait when rate limited", async () => {
      respond(429)

      const result = await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")

      expect(result).toEqual({ success: false, error: "Too many attempts. Please try again later." })
    })

    it("reports a server error without leaking its body", async () => {
      respond(500, { message: "traceback" })

      const result = await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")

      expect(result).toEqual({ success: false, error: "Something went wrong. Please try again." })
    })

    it("reports an unreachable server", async () => {
      mockFetch.mockRejectedValue(new TypeError("Network request failed"))

      const result = await register("paddler@example.com", "paddler_1", "Correct-Horse-9!")

      expect(result).toEqual({
        success: false,
        error: "Could not reach the server. Please try again.",
      })
    })
  })

  describe("login", () => {
    it("tags a refused password so the fingerprint shortcut can tell it from a network failure", async () => {
      respond(401)

      expect(await login("paddler@example.com", "wrong")).toEqual({
        success: false,
        error: "Invalid email or password.",
        code: INVALID_CREDENTIALS,
      })
    })

    it("tags a scheduled deletion", async () => {
      respond(403, { code: "deletion_pending" })

      expect(await login("paddler@example.com", "correct-horse")).toMatchObject({
        success: false,
        code: DELETION_PENDING,
      })
    })

    it("leaves a network failure untagged, so a saved password is not discarded for it", async () => {
      mockFetch.mockRejectedValue(new TypeError("Network request failed"))

      const result = await login("paddler@example.com", "correct-horse")

      expect(result).toEqual({
        success: false,
        error: "Could not reach the server. Please try again.",
      })
    })

    it("stores the tokens on success", async () => {
      respond(200, { access_token: "access", refresh_token: "refresh" })

      expect(await login("paddler@example.com", "correct-horse")).toEqual({ success: true })
      expect(setTokens).toHaveBeenCalledWith("access", "refresh")
    })
  })

  describe("logoutEverywhere", () => {
    it("drops the fingerprint shortcut along with the session, even when the server call fails", async () => {
      ;(getAccessToken as jest.Mock).mockResolvedValue("access")
      mockFetch.mockRejectedValue(new TypeError("Network request failed"))

      await logoutEverywhere()

      expect(clearTokens).toHaveBeenCalled()
      expect(clearBiometricCredentials).toHaveBeenCalled()
    })
  })
})
