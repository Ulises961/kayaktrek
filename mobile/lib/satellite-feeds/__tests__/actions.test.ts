import { SATELLITE_PROVIDER, type SatelliteFeedFormValues } from "@shared/dtos/satellite-feed"

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/client"
import { deleteSatelliteFeed, listSatelliteFeeds, saveSatelliteFeed } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiPatch = apiPatch as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const A_FEED = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
  feedUrl: "https://share.garmin.com/feed/Share/paddler",
  feedUsername: null,
  hasPassword: false,
  needsReauth: false,
  lastPolledAt: "2026-10-17T09:50:00Z",
  lastIngestedAt: null,
  created: "2026-10-01T10:00:00Z",
}

const FORM: SatelliteFeedFormValues = {
  provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
  feedUrl: "https://share.garmin.com/feed/Share/paddler",
  setPassword: false,
  feedPassword: "",
  hasStoredPassword: false,
}

// The body of the one request a save made, so each test can ask about the keys it carries.
function sentBody(mock: jest.Mock): Record<string, unknown> {
  return mock.mock.calls[0][1] as Record<string, unknown>
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiPatch.mockReset()
  mockApiDelete.mockReset()
})

describe("listSatelliteFeeds", () => {
  it("reads every registered feed and parses it", async () => {
    mockApiGet.mockResolvedValue([A_FEED])

    const feeds = await listSatelliteFeeds()

    expect(mockApiGet).toHaveBeenCalledWith("/api/satellite-feeds/all")
    expect(feeds).toHaveLength(1)
    expect(feeds[0].feedUrl).toBe(A_FEED.feedUrl)
    expect(feeds[0].hasPassword).toBe(false)
  })

  it("keeps the needsReauth flag, the one field the card must show loudly", async () => {
    mockApiGet.mockResolvedValue([{ ...A_FEED, needsReauth: true }])

    const feeds = await listSatelliteFeeds()

    expect(feeds[0].needsReauth).toBe(true)
  })

  it("throws when the payload does not match the contract", async () => {
    mockApiGet.mockResolvedValue([{ ...A_FEED, id: "not-a-uuid" }])

    await expect(listSatelliteFeeds()).rejects.toThrow()
  })

  it("throws rather than reporting an empty list when the request fails", async () => {
    // An empty list would read as "no feed registered" and the paddler would register
    // a second one over a feed that is in fact working.
    mockApiGet.mockRejectedValue(new Error("500 Internal Server Error"))

    await expect(listSatelliteFeeds()).rejects.toThrow("500")
  })
})

describe("saveSatelliteFeed", () => {
  describe("the password, in its three states", () => {
    it("sends null when the switch is off, which clears a stored password", async () => {
      mockApiPost.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, { ...FORM, setPassword: false })

      expect(sentBody(mockApiPost).feedPassword).toBeNull()
    })

    it("sends the typed value when the switch is on, which replaces the stored one", async () => {
      mockApiPost.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, { ...FORM, setPassword: true, feedPassword: "tide-table" })

      expect(sentBody(mockApiPost).feedPassword).toBe("tide-table")
    })

    it("omits the key when the switch is on and the box is blank, which leaves it alone", async () => {
      mockApiPatch.mockResolvedValue({ ...A_FEED, hasPassword: true })

      await saveSatelliteFeed(A_FEED.id, {
        ...FORM,
        setPassword: true,
        feedPassword: "",
        hasStoredPassword: true,
      })

      // Presence is the instruction: `undefined` would still be a key to a JSON encoder
      // that kept it, so assert the key is absent, not merely falsy.
      expect("feedPassword" in sentBody(mockApiPatch)).toBe(false)
    })

    it("drops a value that was typed and then switched off", async () => {
      // The switch is the intent. Someone who typed a password and changed their mind
      // must not have it saved behind the switch they just turned off.
      mockApiPost.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, { ...FORM, setPassword: false, feedPassword: "oops" })

      expect(sentBody(mockApiPost).feedPassword).toBeNull()
    })

    it("never sends an empty string", async () => {
      mockApiPost.mockResolvedValue(A_FEED)
      mockApiPatch.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, { ...FORM, setPassword: false, feedPassword: "" })
      await saveSatelliteFeed(A_FEED.id, {
        ...FORM,
        setPassword: true,
        feedPassword: "",
        hasStoredPassword: true,
      })

      const bodies = [mockApiPost.mock.calls[0][1], mockApiPatch.mock.calls[0][1]]
      for (const body of bodies) {
        expect(Object.values(body as Record<string, unknown>)).not.toContain("")
      }
    })
  })

  describe("which request it makes", () => {
    it("creates a feed when there is no id", async () => {
      mockApiPost.mockResolvedValue(A_FEED)

      const saved = await saveSatelliteFeed(null, FORM)

      expect(mockApiPost).toHaveBeenCalledWith("/api/satellite-feeds/create", {
        provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
        feedUrl: FORM.feedUrl,
        feedPassword: null,
      })
      expect(mockApiPatch).not.toHaveBeenCalled()
      expect(saved.id).toBe(A_FEED.id)
    })

    it("updates the named feed in place when there is an id", async () => {
      mockApiPatch.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(A_FEED.id, FORM)

      expect(mockApiPatch).toHaveBeenCalledWith(`/api/satellite-feeds/${A_FEED.id}`, {
        provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
        feedUrl: FORM.feedUrl,
        feedPassword: null,
      })
      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it("trims the URL before sending it", async () => {
      mockApiPost.mockResolvedValue(A_FEED)

      await saveSatelliteFeed(null, { ...FORM, feedUrl: `  ${FORM.feedUrl}\n` })

      expect(sentBody(mockApiPost).feedUrl).toBe(FORM.feedUrl)
    })
  })

  describe("what it refuses before any request", () => {
    it("rejects a URL that is not https", async () => {
      await expect(
        saveSatelliteFeed(null, { ...FORM, feedUrl: "http://share.garmin.com/feed/Share/paddler" }),
      ).rejects.toThrow("Feed URL must use https://")

      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it("rejects an empty URL", async () => {
      await expect(saveSatelliteFeed(null, { ...FORM, feedUrl: "   " })).rejects.toThrow(
        "Enter your feed URL",
      )

      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it("rejects a switch left on with nothing typed and nothing stored", async () => {
      // Nothing to fall back on: sending the key omitted would register an
      // unprotected feed for someone who believes they set a password.
      await expect(
        saveSatelliteFeed(null, { ...FORM, setPassword: true, feedPassword: "" }),
      ).rejects.toThrow("Enter the password, or turn the switch off to remove it")

      expect(mockApiPost).not.toHaveBeenCalled()
    })
  })

  describe("when the server disagrees", () => {
    it("propagates a rejected request rather than reporting a saved feed", async () => {
      mockApiPost.mockRejectedValue(new Error("422 Unprocessable Entity"))

      await expect(saveSatelliteFeed(null, FORM)).rejects.toThrow("422")
    })

    it("throws when the response does not match the contract", async () => {
      mockApiPost.mockResolvedValue({ ...A_FEED, hasPassword: "yes" })

      await expect(saveSatelliteFeed(null, FORM)).rejects.toThrow()
    })
  })
})

describe("deleteSatelliteFeed", () => {
  it("deletes the named feed", async () => {
    mockApiDelete.mockResolvedValue(undefined)

    await deleteSatelliteFeed(A_FEED.id)

    expect(mockApiDelete).toHaveBeenCalledWith(`/api/satellite-feeds/${A_FEED.id}`)
  })

  it("propagates a failure rather than reporting a feed removed", async () => {
    mockApiDelete.mockRejectedValue(new Error("403 Forbidden"))

    await expect(deleteSatelliteFeed(A_FEED.id)).rejects.toThrow("403")
  })
})
