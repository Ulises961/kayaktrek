import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { SATELLITE_PROVIDER, type SatelliteFeed } from "@shared/dtos/satellite-feed"

import {
  deleteSatelliteFeed,
  listSatelliteFeeds,
  saveSatelliteFeed,
} from "../../../lib/satellite-feeds/actions"
import { SatelliteFeedSection } from "../satellite-feed-section"

jest.mock("../../../lib/satellite-feeds/actions", () => ({
  listSatelliteFeeds: jest.fn(),
  saveSatelliteFeed: jest.fn(),
  deleteSatelliteFeed: jest.fn(),
}))

const mockList = listSatelliteFeeds as jest.Mock
const mockSave = saveSatelliteFeed as jest.Mock
const mockDelete = deleteSatelliteFeed as jest.Mock

const FEED_URL = "https://share.garmin.com/feed/Share/paddler"

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString()

const OPEN_FEED: SatelliteFeed = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
  feedUrl: FEED_URL,
  feedUsername: null,
  hasPassword: false,
  needsReauth: false,
  lastPolledAt: minutesAgo(5),
  lastIngestedAt: minutesAgo(12),
  created: minutesAgo(60 * 24),
}

const PROTECTED_FEED: SatelliteFeed = { ...OPEN_FEED, hasPassword: true }

// A destructive action goes through Alert.alert per the mobile dialog convention, so the
// tests drive the confirm button out of the spy rather than the screen. Inside `act`,
// since the button starts async work that sets state after the dialog has gone.
async function confirmAlert(buttonText: string) {
  const spy = Alert.alert as unknown as jest.Mock
  const buttons = spy.mock.calls.at(-1)?.[2] as
    | { text: string; onPress?: () => void }[]
    | undefined
  const button = buttons?.find((entry) => entry.text === buttonText)
  if (!button) throw new Error(`no "${buttonText}" button in the last alert`)
  await act(async () => {
    button.onPress?.()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockList.mockResolvedValue([])
  mockSave.mockResolvedValue(OPEN_FEED)
  mockDelete.mockResolvedValue(undefined)
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("SatelliteFeedSection", () => {
  describe("what it says about trips", () => {
    it("says a trip gets a position only once inReach is switched on for it, and where that is done", async () => {
      const { findByText, queryByText } = await render(<SatelliteFeedSection />)

      expect(await findByText(/only once you switch your inReach on for that trip/i)).toBeTruthy()
      expect(await findByText(/float plan tab on the web/i)).toBeTruthy()
      expect(await findByText(/a trip you have not switched on gets nothing/i)).toBeTruthy()
      // The earlier wording promised every trip under way the position, which is no longer so.
      expect(
        queryByText(/it is polled about every 10 minutes while a trip is under way/i),
      ).toBeNull()
    })
  })

  describe("what it shows", () => {
    it("offers to add a feed when none is registered", async () => {
      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)

      expect(await findByTestId("satellite-add")).toBeTruthy()
      expect(await findByText("Add a feed")).toBeTruthy()
    })

    it("lists a registered feed with its provider, URL and when it was last checked", async () => {
      mockList.mockResolvedValue([OPEN_FEED])

      const { findByText } = await render(<SatelliteFeedSection />)

      expect(await findByText("Garmin inReach")).toBeTruthy()
      expect(await findByText(FEED_URL)).toBeTruthy()
      expect(await findByText(/Last checked 5 min ago/)).toBeTruthy()
      expect(await findByText(/last position 12 min ago/)).toBeTruthy()
    })

    it("says so when a feed has never been polled", async () => {
      mockList.mockResolvedValue([{ ...OPEN_FEED, lastPolledAt: null, lastIngestedAt: null }])

      const { findByText } = await render(<SatelliteFeedSection />)

      expect(await findByText("Not polled yet")).toBeTruthy()
    })

    it("says loudly that a feed needing a new password is not being polled", async () => {
      mockList.mockResolvedValue([{ ...PROTECTED_FEED, needsReauth: true }])

      const { findByText } = await render(<SatelliteFeedSection />)

      expect(await findByText(/Sign-in failed/)).toBeTruthy()
      expect(await findByText(/not being polled/)).toBeTruthy()
    })

    it("shows no sign-in warning for a healthy feed", async () => {
      mockList.mockResolvedValue([PROTECTED_FEED])

      const { findByText, queryByText } = await render(<SatelliteFeedSection />)
      await findByText("Garmin inReach")

      expect(queryByText(/Sign-in failed/)).toBeNull()
    })

    it("reminds the paddler that the SOS button never goes through the app", async () => {
      const { findByText } = await render(<SatelliteFeedSection />)

      expect(await findByText(/SOS button is unaffected/)).toBeTruthy()
    })
  })

  describe("when the feeds cannot be loaded", () => {
    it("shows the failure and withholds Add, so a working feed is not registered twice", async () => {
      mockList.mockRejectedValue(new Error("Could not reach the server."))

      const { findByText, queryByTestId } = await render(<SatelliteFeedSection />)

      expect(await findByText("Could not load your satellite feed.")).toBeTruthy()
      expect(queryByTestId("satellite-add")).toBeNull()
    })

    it("offers a retry that loads the feeds again", async () => {
      mockList.mockRejectedValueOnce(new Error("Could not reach the server."))
      mockList.mockResolvedValueOnce([OPEN_FEED])

      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-retry"))

      expect(await findByText("Garmin inReach")).toBeTruthy()
      expect(mockList).toHaveBeenCalledTimes(2)
    })
  })

  describe("adding a feed", () => {
    it("saves a public feed with the password switch off, then shows the new list", async () => {
      mockList.mockResolvedValueOnce([])
      mockList.mockResolvedValueOnce([OPEN_FEED])

      const { findByTestId, findByText, queryByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))
      await fireEvent.changeText(await findByTestId("satellite-url"), FEED_URL)
      await fireEvent.press(await findByTestId("satellite-save"))

      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(null, {
          provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
          feedUrl: FEED_URL,
          setPassword: false,
          feedPassword: "",
          hasStoredPassword: false,
        }),
      )
      expect(await findByText("Garmin inReach")).toBeTruthy()
      expect(queryByTestId("satellite-url")).toBeNull()
    })

    it("asks for the password only once the switch is on", async () => {
      const { findByTestId, queryByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))

      expect(queryByTestId("satellite-password")).toBeNull()

      await fireEvent(await findByTestId("satellite-password-switch"), "valueChange", true)

      expect(await findByTestId("satellite-password")).toBeTruthy()
    })

    it("sends the typed password with the switch on", async () => {
      const { findByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))
      await fireEvent.changeText(await findByTestId("satellite-url"), FEED_URL)
      await fireEvent(await findByTestId("satellite-password-switch"), "valueChange", true)
      await fireEvent.changeText(await findByTestId("satellite-password"), "tide-table")
      await fireEvent.press(await findByTestId("satellite-save"))

      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(
          null,
          expect.objectContaining({ setPassword: true, feedPassword: "tide-table" }),
        ),
      )
    })

    it("keeps the form open with what was typed when the save fails", async () => {
      mockSave.mockRejectedValue(new Error("Feed URL must use https://"))

      const { findByTestId, findByText, getByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))
      await fireEvent.changeText(await findByTestId("satellite-url"), "http://nope")
      await fireEvent.press(await findByTestId("satellite-save"))

      expect(await findByText("Feed URL must use https://")).toBeTruthy()
      expect(getByTestId("satellite-url").props.value).toBe("http://nope")
    })

    it("closes the form without saving on Cancel", async () => {
      const { findByTestId, queryByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))
      await fireEvent.press(await findByTestId("satellite-cancel"))

      expect(queryByTestId("satellite-url")).toBeNull()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("disables Save while the request is in flight so it cannot be sent twice", async () => {
      let finish: (feed: SatelliteFeed) => void = () => {}
      mockSave.mockReturnValue(new Promise<SatelliteFeed>((resolve) => (finish = resolve)))

      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId("satellite-add"))
      await fireEvent.changeText(await findByTestId("satellite-url"), FEED_URL)
      await fireEvent.press(await findByTestId("satellite-save"))
      await fireEvent.press(await findByTestId("satellite-save"))

      expect(await findByText("Saving…")).toBeTruthy()
      expect(mockSave).toHaveBeenCalledTimes(1)

      finish(OPEN_FEED)
      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    })
  })

  describe("editing a feed", () => {
    it("opens with the URL filled in and the switch off for a feed with no password", async () => {
      mockList.mockResolvedValue([OPEN_FEED])

      const { findByTestId, getByTestId, queryByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-edit-${OPEN_FEED.id}`))

      expect(getByTestId("satellite-url").props.value).toBe(FEED_URL)
      expect(getByTestId("satellite-password-switch").props.value).toBe(false)
      expect(queryByText(/will remove the stored password/)).toBeNull()
    })

    it("opens with the switch ON for a feed that has a password", async () => {
      // The switch has to start where the feed already stands: off clears, so a form that
      // always opened off would wipe a working password the moment only the URL was edited.
      mockList.mockResolvedValue([PROTECTED_FEED])

      const { findByTestId, getByTestId, getByPlaceholderText } = await render(
        <SatelliteFeedSection />,
      )
      await fireEvent.press(await findByTestId(`satellite-edit-${PROTECTED_FEED.id}`))

      expect(getByTestId("satellite-password-switch").props.value).toBe(true)
      expect(getByPlaceholderText("Unchanged")).toBeTruthy()
    })

    it("leaves a stored password alone when only the URL is edited", async () => {
      mockList.mockResolvedValue([PROTECTED_FEED])

      const { findByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-edit-${PROTECTED_FEED.id}`))
      await fireEvent.changeText(
        await findByTestId("satellite-url"),
        "https://share.garmin.com/feed/Share/renamed",
      )
      await fireEvent.press(await findByTestId("satellite-save"))

      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(PROTECTED_FEED.id, {
          provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
          feedUrl: "https://share.garmin.com/feed/Share/renamed",
          setPassword: true,
          feedPassword: "",
          hasStoredPassword: true,
        }),
      )
    })

    it("warns in destructive colour before saving when the switch is turned off", async () => {
      mockList.mockResolvedValue([PROTECTED_FEED])

      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-edit-${PROTECTED_FEED.id}`))
      await fireEvent(await findByTestId("satellite-password-switch"), "valueChange", false)

      expect(await findByText(/Saving will remove the stored password/)).toBeTruthy()
    })

    it("asks the server to clear the password when saved with the switch off", async () => {
      mockList.mockResolvedValue([PROTECTED_FEED])

      const { findByTestId } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-edit-${PROTECTED_FEED.id}`))
      await fireEvent(await findByTestId("satellite-password-switch"), "valueChange", false)
      await fireEvent.press(await findByTestId("satellite-save"))

      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(
          PROTECTED_FEED.id,
          expect.objectContaining({ setPassword: false, hasStoredPassword: true }),
        ),
      )
    })
  })

  describe("removing a feed", () => {
    it("confirms first, then deletes it and refreshes the list", async () => {
      mockList.mockResolvedValueOnce([OPEN_FEED])
      mockList.mockResolvedValueOnce([])

      const { findByTestId, findByText, queryByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-remove-${OPEN_FEED.id}`))

      expect(mockDelete).not.toHaveBeenCalled()
      await confirmAlert("Remove")

      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(OPEN_FEED.id))
      expect(await findByText("Add a feed")).toBeTruthy()
      expect(queryByText("Garmin inReach")).toBeNull()
    })

    it("does nothing when the confirmation is cancelled", async () => {
      mockList.mockResolvedValue([OPEN_FEED])

      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-remove-${OPEN_FEED.id}`))
      await confirmAlert("Cancel")

      expect(mockDelete).not.toHaveBeenCalled()
      expect(await findByText("Garmin inReach")).toBeTruthy()
    })

    it("keeps the feed on screen and says so when the removal fails", async () => {
      mockList.mockResolvedValue([OPEN_FEED])
      mockDelete.mockRejectedValue(new Error("Failed to remove the feed."))

      const { findByTestId, findByText } = await render(<SatelliteFeedSection />)
      await fireEvent.press(await findByTestId(`satellite-remove-${OPEN_FEED.id}`))
      await confirmAlert("Remove")

      expect(await findByText("Failed to remove the feed.")).toBeTruthy()
      expect(await findByText("Garmin inReach")).toBeTruthy()
    })
  })
})
