import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SATELLITE_PROVIDER } from "@/lib/dtos/satellite-feed"

vi.mock("@/lib/satellite-feeds/actions", () => ({
  saveSatelliteFeed: vi.fn(),
  deleteSatelliteFeed: vi.fn(),
}))

import { deleteSatelliteFeed, saveSatelliteFeed } from "@/lib/satellite-feeds/actions"
import { SatelliteFeedSection } from "@/components/settings/satellite-feed-section"

const FEED = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
  feedUrl: "https://share.garmin.com/feed/Share/paddler",
  feedUsername: null,
  needsReauth: false,
  lastPolledAt: "2026-09-21T10:00:00",
  lastIngestedAt: "2026-09-21T09:50:00",
  created: "2026-09-01T10:00:00",
}

beforeEach(() => {
  vi.mocked(saveSatelliteFeed).mockReset().mockResolvedValue({ success: true })
  vi.mocked(deleteSatelliteFeed).mockReset().mockResolvedValue({ success: true })
})

describe("SatelliteFeedSection", () => {
  it("invites a first feed when none is registered", async () => {
    render(<SatelliteFeedSection feeds={[]} />)

    expect(await screen.findByRole("button", { name: /add a feed/i })).toBeInTheDocument()
  })

  it("shows a registered feed's URL", () => {
    render(<SatelliteFeedSection feeds={[FEED]} />)

    expect(screen.getByText(FEED.feedUrl)).toBeInTheDocument()
  })

  it("saves a new feed", async () => {
    const user = userEvent.setup()
    render(<SatelliteFeedSection feeds={[]} />)

    await user.click(screen.getByRole("button", { name: /add a feed/i }))
    await user.type(screen.getByLabelText(/feed url/i), FEED.feedUrl)
    await user.click(screen.getByRole("button", { name: /^save feed$/i }))

    await waitFor(() => {
      expect(saveSatelliteFeed).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ feedUrl: FEED.feedUrl }),
      )
    })
  })

  it("refuses a non-https URL in the browser, without a round trip", async () => {
    const user = userEvent.setup()
    render(<SatelliteFeedSection feeds={[]} />)

    await user.click(screen.getByRole("button", { name: /add a feed/i }))
    await user.type(screen.getByLabelText(/feed url/i), "http://share.garmin.com/feed/Share/x")
    await user.click(screen.getByRole("button", { name: /^save feed$/i }))

    expect(await screen.findByText(/must use https/i)).toBeInTheDocument()
    expect(saveSatelliteFeed).not.toHaveBeenCalled()
  })

  describe("the password switch", () => {
    it("hides the password field until the switch is turned on", async () => {
      const user = userEvent.setup()
      render(<SatelliteFeedSection feeds={[]} />)

      await user.click(screen.getByRole("button", { name: /add a feed/i }))
      expect(screen.queryByLabelText(/^mapshare password$/i)).not.toBeInTheDocument()

      await user.click(screen.getByRole("switch", { name: /password/i }))
      expect(screen.getByLabelText(/^mapshare password$/i)).toBeInTheDocument()
    })

    it("starts off when editing, so saving cannot disturb a stored password", async () => {
      const user = userEvent.setup()
      render(<SatelliteFeedSection feeds={[FEED]} />)

      await user.click(screen.getByRole("button", { name: /edit/i }))

      expect(screen.getByRole("switch", { name: /password/i })).not.toBeChecked()
      await user.click(screen.getByRole("button", { name: /^save feed$/i }))

      await waitFor(() => {
        expect(saveSatelliteFeed).toHaveBeenCalledWith(
          FEED.id,
          expect.objectContaining({ setPassword: false }),
        )
      })
    })

    it("passes the switch and the typed password through together", async () => {
      const user = userEvent.setup()
      render(<SatelliteFeedSection feeds={[FEED]} />)

      await user.click(screen.getByRole("button", { name: /edit/i }))
      await user.click(screen.getByRole("switch", { name: /password/i }))
      await user.type(screen.getByLabelText(/^mapshare password$/i), "s3cret")
      await user.click(screen.getByRole("button", { name: /^save feed$/i }))

      await waitFor(() => {
        expect(saveSatelliteFeed).toHaveBeenCalledWith(
          FEED.id,
          expect.objectContaining({ setPassword: true, feedPassword: "s3cret" }),
        )
      })
    })

    it("will not save a switch turned on with nothing typed", async () => {
      const user = userEvent.setup()
      render(<SatelliteFeedSection feeds={[FEED]} />)

      await user.click(screen.getByRole("button", { name: /edit/i }))
      await user.click(screen.getByRole("switch", { name: /password/i }))
      await user.click(screen.getByRole("button", { name: /^save feed$/i }))

      expect(await screen.findByText(/enter the password, or turn this off/i)).toBeInTheDocument()
      expect(saveSatelliteFeed).not.toHaveBeenCalled()
    })
  })

  it("edits an existing feed in place, passing its id", async () => {
    const user = userEvent.setup()
    render(<SatelliteFeedSection feeds={[FEED]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))
    await user.click(screen.getByRole("button", { name: /^save feed$/i }))

    await waitFor(() => {
      expect(saveSatelliteFeed).toHaveBeenCalledWith(FEED.id, expect.anything())
    })
  })

  it("surfaces the server's error rather than claiming success", async () => {
    vi.mocked(saveSatelliteFeed).mockResolvedValue({
      success: false,
      error: "That feed URL is already registered.",
    })
    const user = userEvent.setup()
    render(<SatelliteFeedSection feeds={[]} />)

    await user.click(screen.getByRole("button", { name: /add a feed/i }))
    await user.type(screen.getByLabelText(/feed url/i), FEED.feedUrl)
    await user.click(screen.getByRole("button", { name: /^save feed$/i }))

    expect(await screen.findByText("That feed URL is already registered.")).toBeInTheDocument()
  })

  it("removes a feed", async () => {
    const user = userEvent.setup()
    render(<SatelliteFeedSection feeds={[FEED]} />)

    await user.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => expect(deleteSatelliteFeed).toHaveBeenCalledWith(FEED.id))
  })

  describe("needs-reauth", () => {
    it("says so loudly when a feed stopped authenticating", async () => {
      // The poll task skips a needs_reauth feed entirely, so a paddler would otherwise
      // believe they are being tracked while nothing is being ingested.
      render(<SatelliteFeedSection feeds={[{ ...FEED, needsReauth: true }]} />)

      expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument()
    })

    it("stays quiet for a healthy feed", () => {
      render(<SatelliteFeedSection feeds={[FEED]} />)

      expect(screen.queryByText(/sign-in failed/i)).not.toBeInTheDocument()
    })
  })

  it("says a feed has never been polled rather than showing a blank", () => {
    render(<SatelliteFeedSection feeds={[{ ...FEED, lastPolledAt: null }]} />)

    expect(screen.getByText(/not polled yet/i)).toBeInTheDocument()
  })
})
