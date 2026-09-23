import { describe, it, expect, vi, beforeEach } from "vitest"

import { SATELLITE_PROVIDER, type SatelliteFeedFormValues } from "@/lib/dtos/satellite-feed"

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: (e: unknown) => (e as { digest?: string })?.digest === "NEXT_REDIRECT",
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client"
import {
  deleteSatelliteFeed,
  listSatelliteFeeds,
  saveSatelliteFeed,
} from "@/lib/satellite-feeds/actions"

const A_FEED = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
  feedUrl: "https://share.garmin.com/feed/Share/paddler",
  feedUsername: null,
  needsReauth: false,
  hasPassword: false,
  lastPolledAt: null,
  lastIngestedAt: null,
  created: "2026-09-21T10:00:00",
}

// The switch defaults are the safe ones: no password being set, none already stored.
// Every test states only the fields it is actually about.
function _form(overrides: Partial<SatelliteFeedFormValues> = {}): SatelliteFeedFormValues {
  return {
    provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
    feedUrl: A_FEED.feedUrl,
    setPassword: false,
    hasStoredPassword: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset()
  vi.mocked(apiPost).mockReset()
  vi.mocked(apiPatch).mockReset()
  vi.mocked(apiDelete).mockReset()
})

describe("listSatelliteFeeds", () => {
  it("reads the feeds from the collection endpoint", async () => {
    vi.mocked(apiGet).mockResolvedValue([A_FEED])

    const feeds = await listSatelliteFeeds()

    expect(apiGet).toHaveBeenCalledWith("/api/satellite-feeds/all")
    expect(feeds).toHaveLength(1)
    expect(feeds[0].feedUrl).toBe(A_FEED.feedUrl)
  })

  it("returns nothing rather than throwing when the lookup fails", async () => {
    // Settings renders five other cards; one failing lookup must not take the page down.
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))

    await expect(listSatelliteFeeds()).resolves.toEqual([])
  })

  it("rethrows a redirect so an expired session still reaches /login", async () => {
    vi.mocked(apiGet).mockRejectedValue({ digest: "NEXT_REDIRECT" })

    await expect(listSatelliteFeeds()).rejects.toMatchObject({ digest: "NEXT_REDIRECT" })
  })
})

describe("saveSatelliteFeed", () => {
  it("creates a feed when given no id", async () => {
    vi.mocked(apiPost).mockResolvedValue(A_FEED)

    const result = await saveSatelliteFeed(null, _form())

    expect(apiPost).toHaveBeenCalledWith(
      "/api/satellite-feeds/create",
      expect.objectContaining({ feedUrl: A_FEED.feedUrl }),
    )
    expect(result).toEqual({ success: true })
  })

  it("updates in place when given an id", async () => {
    vi.mocked(apiPatch).mockResolvedValue(A_FEED)

    await saveSatelliteFeed(A_FEED.id, _form())

    expect(apiPatch).toHaveBeenCalledWith(
      `/api/satellite-feeds/${A_FEED.id}`,
      expect.objectContaining({ feedUrl: A_FEED.feedUrl }),
    )
    expect(apiPost).not.toHaveBeenCalled()
  })

  it("trims the URL before sending it", async () => {
    vi.mocked(apiPost).mockResolvedValue(A_FEED)

    await saveSatelliteFeed(null, _form({ feedUrl: `  ${A_FEED.feedUrl}  ` }))

    expect(apiPost).toHaveBeenCalledWith(
      "/api/satellite-feeds/create",
      expect.objectContaining({ feedUrl: A_FEED.feedUrl }),
    )
  })

  it("rejects a non-https URL without calling the API", async () => {
    const result = await saveSatelliteFeed(
      null,
      _form({ feedUrl: "http://share.garmin.com/feed/Share/paddler" }),
    )

    expect(result).toEqual({ success: false, error: "Feed URL must use https://" })
    expect(apiPost).not.toHaveBeenCalled()
  })

  // Three outcomes, and the difference between them is the whole feature: null clears a
  // stored password, an omitted key leaves it alone, a value replaces it. An empty
  // string is never sent, because the backend cannot tell it from "clear".
  describe("the password switch", () => {
    it("sends null to clear the stored password when the switch is off", async () => {
      vi.mocked(apiPatch).mockResolvedValue(A_FEED)

      await saveSatelliteFeed(A_FEED.id, _form({ setPassword: false, hasStoredPassword: true }))

      const body = vi.mocked(apiPatch).mock.calls[0][1] as Record<string, unknown>
      expect(body.feedPassword).toBeNull()
    })

    it("ignores a typed password the user then switched off, and still clears", async () => {
      // The switch is the intent; the field is only where the value was typed. Sending
      // the typed value here would save a password the user just said to remove.
      vi.mocked(apiPatch).mockResolvedValue(A_FEED)

      await saveSatelliteFeed(
        A_FEED.id,
        _form({
          setPassword: false,
          hasStoredPassword: true,
          feedPassword: "typed-then-thought-better-of-it",
        }),
      )

      const body = vi.mocked(apiPatch).mock.calls[0][1] as Record<string, unknown>
      expect(body.feedPassword).toBeNull()
    })

    it("omits the key entirely when the switch is on and nothing was retyped", async () => {
      // Editing only the feed URL of a password-protected feed. The server never echoes
      // the stored password, so there is nothing to resend — absence is what tells the
      // backend to leave it alone, and it must not collapse into null or "".
      vi.mocked(apiPatch).mockResolvedValue(A_FEED)

      await saveSatelliteFeed(A_FEED.id, _form({ setPassword: true, hasStoredPassword: true }))

      const body = vi.mocked(apiPatch).mock.calls[0][1] as Record<string, unknown>
      expect(body).not.toHaveProperty("feedPassword")
    })

    it("sends the password when the switch is on and one was typed", async () => {
      vi.mocked(apiPost).mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, _form({ setPassword: true, feedPassword: "s3cret" }))

      expect(apiPost).toHaveBeenCalledWith(
        "/api/satellite-feeds/create",
        expect.objectContaining({ feedPassword: "s3cret" }),
      )
    })

    it("refuses a switch turned on with nothing typed and nothing stored", async () => {
      // On a new feed there is no stored password for a blank field to mean "keep".
      const result = await saveSatelliteFeed(
        null,
        _form({ setPassword: true, feedPassword: "", hasStoredPassword: false }),
      )

      expect(result).toEqual({
        success: false,
        error: "Enter the password, or turn the switch off to remove it",
      })
      expect(apiPost).not.toHaveBeenCalled()
    })
  })

  it("surfaces the server's message rather than a generic failure", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Feed URL must use https://"))

    const result = await saveSatelliteFeed(null, _form())

    expect(result).toEqual({ success: false, error: "Feed URL must use https://" })
  })
})

describe("deleteSatelliteFeed", () => {
  it("deletes the named feed", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)

    const result = await deleteSatelliteFeed(A_FEED.id)

    expect(apiDelete).toHaveBeenCalledWith(`/api/satellite-feeds/${A_FEED.id}`)
    expect(result).toEqual({ success: true })
  })

  it("reports a failure instead of pretending the feed is gone", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("Forbidden"))

    await expect(deleteSatelliteFeed(A_FEED.id)).resolves.toEqual({
      success: false,
      error: "Forbidden",
    })
  })
})
