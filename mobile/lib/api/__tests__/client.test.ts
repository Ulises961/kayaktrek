import { apiGet, SessionExpiredError } from "../client"
import { getAccessToken } from "../../auth/token-store"
import { refreshSession } from "../../auth/refresh"

jest.mock("../../auth/token-store", () => ({
  getAccessToken: jest.fn(),
}))
jest.mock("../../auth/refresh", () => ({
  refreshSession: jest.fn(),
}))

const mockGetAccessToken = getAccessToken as jest.Mock
const mockRefreshSession = refreshSession as jest.Mock

describe("apiGet", () => {
  beforeEach(() => {
    mockGetAccessToken.mockReset()
    mockRefreshSession.mockReset()
    globalThis.fetch = jest.fn()
  })

  it("attaches the stored access token as a Bearer header", async () => {
    mockGetAccessToken.mockResolvedValue("stored-token")
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    await apiGet("/api/trip/all")

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer stored-token" }),
      }),
    )
  })

  it("retries once after a successful refresh on 401, and succeeds", async () => {
    mockGetAccessToken.mockResolvedValue("expired-token")
    mockRefreshSession.mockResolvedValue(true)
    ;(globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

    const result = await apiGet<{ ok: boolean }>("/api/trip/all")

    expect(result).toEqual({ ok: true })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
  })

  // The failure-path assertion that matters: a dead refresh must not retry forever or
  // silently return an empty/undefined result — it has to surface as something the auth
  // context can act on (SessionExpiredError -> notifySessionExpired was already called
  // inside refreshSession itself; this asserts the caller-visible half of that contract).
  it("throws SessionExpiredError, not a generic error, when refresh fails on 401", async () => {
    mockGetAccessToken.mockResolvedValue("expired-token")
    mockRefreshSession.mockResolvedValue(false)
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })

    await expect(apiGet("/api/trip/all")).rejects.toBeInstanceOf(SessionExpiredError)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
