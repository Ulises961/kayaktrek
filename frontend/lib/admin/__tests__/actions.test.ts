import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiPost: vi.fn(),
}))

import { ApiError, apiPost } from "@/lib/api/client"
import { correctUnverifiedMail } from "@/lib/admin/actions"

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const fields = { username: "kayaker", newMail: "right@example.com" }

beforeEach(() => {
  vi.mocked(apiPost).mockReset()
})

describe("correctUnverifiedMail", () => {
  it("sends the username and the new address, and returns what the backend stored", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      status: "success",
      username: "kayaker",
      mail: "right@example.com",
    })

    const result = await correctUnverifiedMail(null, formData(fields))

    expect(apiPost).toHaveBeenCalledWith("/api/user/correct-unverified-mail", {
      username: "kayaker",
      newMail: "right@example.com",
    })
    expect(result).toEqual({ success: true, username: "kayaker", mail: "right@example.com" })
  })

  it("trims what was typed", async () => {
    vi.mocked(apiPost).mockResolvedValue({ username: "kayaker", mail: "right@example.com" })

    await correctUnverifiedMail(
      null,
      formData({ username: " kayaker ", newMail: " right@example.com " }),
    )

    expect(apiPost).toHaveBeenCalledWith("/api/user/correct-unverified-mail", fields)
  })

  it("refuses a malformed address without calling the backend", async () => {
    const result = await correctUnverifiedMail(null, formData({ ...fields, newMail: "nope" }))

    expect(result).toEqual({ success: false, error: "Enter a valid email address." })
    expect(apiPost).not.toHaveBeenCalled()
  })

  it("refuses a missing username without calling the backend", async () => {
    const result = await correctUnverifiedMail(null, formData({ ...fields, username: " " }))

    expect(result).toEqual({ success: false, error: "Username is required." })
    expect(apiPost).not.toHaveBeenCalled()
  })

  it.each([
    [404, "No account with username kayaker"],
    [409, "That address belongs to another account"],
    [400, "Invalid email format"],
  ])("passes the backend's %i explanation through to the admin", async (status, message) => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError(message, status))

    const result = await correctUnverifiedMail(null, formData(fields))

    expect(result).toEqual({ success: false, error: message })
  })

  it("says plainly that a non-admin cannot do this", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("Admin access required", 403))

    const result = await correctUnverifiedMail(null, formData(fields))

    expect(result).toEqual({ success: false, error: "Only administrators can do this." })
  })

  it("does not repeat a server fault's detail", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("connection refused to db-7", 500))

    const result = await correctUnverifiedMail(null, formData(fields))

    expect(result).toEqual({ success: false, error: "Something went wrong. Please try again." })
  })

  it("returns a generic failure when the request itself fails", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("network"))

    const result = await correctUnverifiedMail(null, formData(fields))

    expect(result).toEqual({ success: false, error: "Something went wrong. Please try again." })
  })

  it("lets a dead session's redirect through instead of reporting it as a failure", async () => {
    const redirectSignal = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    vi.mocked(apiPost).mockRejectedValue(redirectSignal)

    await expect(correctUnverifiedMail(null, formData(fields))).rejects.toBe(redirectSignal)
  })
})
