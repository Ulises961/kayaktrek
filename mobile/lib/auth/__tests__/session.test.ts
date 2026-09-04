import { getSession } from "../session"
import { getAccessToken } from "../token-store"

jest.mock("../token-store", () => ({
  getAccessToken: jest.fn(),
}))

const mockGetAccessToken = getAccessToken as jest.Mock

// A real JWT's payload segment, base64url-encoded, no signature needed for this test —
// decodeJwtPayload never verifies one, same as the web client's version.
function fakeToken(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  const b64url = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `header.${b64url}.signature`
}

describe("getSession", () => {
  it("decodes user_id and email from the stored access token", async () => {
    mockGetAccessToken.mockResolvedValue(
      fakeToken({ user_id: "abc-123", email: "paddler@example.com" }),
    )

    const session = await getSession()

    expect(session).toEqual({ userId: "abc-123", email: "paddler@example.com" })
  })

  it("returns null when there is no stored token", async () => {
    mockGetAccessToken.mockResolvedValue(null)

    expect(await getSession()).toBeNull()
  })
})
