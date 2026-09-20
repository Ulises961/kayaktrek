import { apiDelete, apiGet } from "../../api/client"
import { listSessions, revokeSession } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const A_SESSION = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  deviceLabel: "Pixel 8",
  locationLabel: "Edinburgh, GB",
  created: "2026-09-01T10:00:00Z",
  lastUsedAt: "2026-09-20T10:00:00Z",
  expiresAt: "2026-10-20T10:00:00Z",
  isCurrent: true,
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiDelete.mockReset()
})

describe("listSessions", () => {
  it("reads every device from the sessions endpoint", async () => {
    mockApiGet.mockResolvedValue([A_SESSION])

    const sessions = await listSessions()

    expect(mockApiGet).toHaveBeenCalledWith("/api/sessions/all")
    expect(sessions).toHaveLength(1)
    expect(sessions[0].deviceLabel).toBe("Pixel 8")
    expect(sessions[0].isCurrent).toBe(true)
  })

  it("accepts a session whose labels the backend could not derive", async () => {
    // deviceLabel comes from the User-Agent and locationLabel from proxy headers;
    // neither is invented when the source says nothing, so both are nullable.
    mockApiGet.mockResolvedValue([{ ...A_SESSION, deviceLabel: null, locationLabel: null }])

    const sessions = await listSessions()

    expect(sessions[0].deviceLabel).toBeNull()
  })

  it("throws when the payload does not match the schema", async () => {
    mockApiGet.mockResolvedValue([{ ...A_SESSION, id: "not-a-uuid" }])

    await expect(listSessions()).rejects.toThrow()
  })
})

describe("revokeSession", () => {
  it("deletes the named session", async () => {
    mockApiDelete.mockResolvedValue(undefined)

    await revokeSession(A_SESSION.id)

    expect(mockApiDelete).toHaveBeenCalledWith(`/api/sessions/${A_SESSION.id}`)
  })

  it("propagates a failure rather than reporting a device signed out", async () => {
    mockApiDelete.mockRejectedValue(new Error("403 Forbidden"))

    await expect(revokeSession(A_SESSION.id)).rejects.toThrow("403")
  })
})
