import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")
  return { ...actual, apiPost: vi.fn() }
})

import { apiPost } from "@/lib/api/client"
import { NOTIFICATION_KIND } from "@/lib/dtos/pending-requests"
import { markNotificationsRead } from "../mutations"

const mockApiPost = vi.mocked(apiPost)

beforeEach(() => {
  mockApiPost.mockReset()
})

describe("markNotificationsRead", () => {
  it("posts the kind to the notifications endpoint", async () => {
    mockApiPost.mockResolvedValue({ marked: 1 })

    const result = await markNotificationsRead(NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED)

    expect(mockApiPost).toHaveBeenCalledWith("/api/pending-requests/notifications/read", {
      kind: NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED,
    })
    expect(result).toEqual({ success: true })
  })

  it("reports a failure instead of throwing, so opening a row never breaks the page", async () => {
    mockApiPost.mockRejectedValue(new Error("backend down"))

    const result = await markNotificationsRead(NOTIFICATION_KIND.TRIP_INVITATION_ACCEPTED)

    expect(result).toEqual({ success: false, error: "backend down" })
  })

  it("lets a dead session's redirect through", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    mockApiPost.mockRejectedValue(redirect)

    await expect(markNotificationsRead(NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED)).rejects.toBe(
      redirect,
    )
  })
})
