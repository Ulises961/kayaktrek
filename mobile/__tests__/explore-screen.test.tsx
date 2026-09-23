import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import { DIFFICULTIES } from "@shared/dtos/difficulty"
import { DISTANCE_UNIT, formatDistance } from "@shared/itinerary/distance"

import ExploreScreen from "../app/(app)/(drawer)/(explore)/explore/index"
import { searchPublicItineraries } from "../lib/explore/actions"
import { getMe } from "../lib/profile/actions"
import { useIsOffline } from "../lib/network/use-is-offline"

jest.mock("../lib/explore/actions", () => ({
  searchPublicItineraries: jest.fn(),
}))
jest.mock("../lib/profile/actions", () => ({
  getMe: jest.fn(),
}))
jest.mock("../lib/network/use-is-offline", () => ({ useIsOffline: jest.fn(() => false) }))

const mockSearch = searchPublicItineraries as jest.Mock
const mockGetMe = getMe as jest.Mock
const mockUseIsOffline = useIsOffline as jest.Mock

function page(items: unknown[], overrides: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

const SKYE = {
  id: "itin-1",
  name: "Skye circuit",
  description: "Three days around the Cuillin coast.",
  difficulty: DIFFICULTIES[1],
  season: "summer",
  totalMiles: 42.5,
  dayCount: 3,
  longestDayMiles: 18.2,
  pointCount: 0,
  placeCount: 0,
  photoCount: 0,
  previewPositions: [
    [57.2, -6.3],
    [57.3, -6.1],
  ],
  author: { username: "hebridean", linkable: true },
}

const ARRAN = { ...SKYE, id: "itin-2", name: "Arran loop" }

const UNIT = DISTANCE_UNIT.NM

// The name filter is debounced, so every assertion about a search triggered by typing
// goes through waitFor rather than reading the mock immediately.
async function typeSearch(getByTestId: (id: string) => unknown, text: string) {
  await fireEvent.changeText(getByTestId("explore-search") as never, text)
}

beforeEach(() => {
  mockSearch.mockReset()
  mockGetMe.mockReset()
  mockGetMe.mockResolvedValue({ unitPreference: UNIT })
  mockUseIsOffline.mockReturnValue(false)
})

describe("ExploreScreen", () => {
  it("lists the published routes returned by the search", async () => {
    mockSearch.mockResolvedValue(page([SKYE]))

    const { findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Skye circuit")).toBeTruthy()
    expect(await findByText("Three days around the Cuillin coast.")).toBeTruthy()
  })

  it("shows the route's own signals rather than leaving the card bare", async () => {
    mockSearch.mockResolvedValue(page([SKYE]))

    const { findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    // The signals M23 added because description and difficulty are null on real
    // routes: total distance, day count, and the hardest day rather than the average.
    expect(await findByText(new RegExp(formatDistance(SKYE.totalMiles, UNIT)))).toBeTruthy()
    expect(await findByText(/3 days/)).toBeTruthy()
    expect(
      await findByText(new RegExp(`Longest day ${formatDistance(SKYE.longestDayMiles, UNIT)}`)),
    ).toBeTruthy()
  })

  it("asks for the same page size web does", async () => {
    mockSearch.mockResolvedValue(page([SKYE]))

    await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ perPage: 20 }))
    })
  })

  it("reports how many routes matched", async () => {
    mockSearch.mockResolvedValue(page([SKYE], { total: 7 }))

    const { findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("7 routes")).toBeTruthy()
  })

  it("says route, singular, when exactly one matched", async () => {
    mockSearch.mockResolvedValue(page([SKYE], { total: 1 }))

    const { findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("1 route")).toBeTruthy()
  })

  it("searches by name without needing the query submitted", async () => {
    mockSearch.mockResolvedValue(page([]))

    const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
    await waitFor(() => expect(mockSearch).toHaveBeenCalled())

    await typeSearch(getByTestId, "skye")

    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ name: "skye" }))
    })
  })

  describe("filters", () => {
    it("filters by season", async () => {
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-filters-open"))
      await fireEvent.press(getByTestId("filter-season-summer"))

      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(
          expect.objectContaining({ seasons: ["summer"] }),
        )
      })
    })

    it("sends distance and duration bounds as numbers, not strings", async () => {
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-filters-open"))
      await fireEvent.changeText(getByTestId("filter-min-miles"), "10")
      await fireEvent.changeText(getByTestId("filter-max-days"), "4")

      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(
          expect.objectContaining({ minMiles: 10, maxDays: 4 }),
        )
      })
    })

    it("omits a bound that was typed and then cleared", async () => {
      // An empty string must not become 0 — a 0-mile minimum is a different query from
      // no minimum, and NaN would be sent as a parameter the backend cannot parse.
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-filters-open"))
      await fireEvent.changeText(getByTestId("filter-min-miles"), "10")
      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ minMiles: 10 }))
      })

      await fireEvent.changeText(getByTestId("filter-min-miles"), "")

      await waitFor(() => {
        expect(mockSearch.mock.calls.at(-1)?.[0].minMiles).toBeUndefined()
      })
    })

    it("counts the active filters so they are visible with the sheet closed", async () => {
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId, findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-filters-open"))
      await fireEvent.press(getByTestId("filter-season-summer"))
      await fireEvent.changeText(getByTestId("filter-min-miles"), "10")
      await fireEvent.press(getByTestId("explore-filters-done"))

      // Seasons and distance are one each, the same way web's activeFilterCount groups
      // a min/max pair as a single filter rather than two.
      expect(await findByText("2")).toBeTruthy()
    })

    it("clears every filter at once", async () => {
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-filters-open"))
      await fireEvent.press(getByTestId("filter-season-summer"))
      await fireEvent.changeText(getByTestId("filter-min-miles"), "10")
      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(
          expect.objectContaining({ seasons: ["summer"], minMiles: 10 }),
        )
      })

      await fireEvent.press(getByTestId("explore-filters-clear"))

      await waitFor(() => {
        const last = mockSearch.mock.calls.at(-1)?.[0]
        expect(last.seasons).toEqual([])
        expect(last.minMiles).toBeUndefined()
      })
    })

    it("sorts by the chosen order", async () => {
      mockSearch.mockResolvedValue(page([SKYE]))

      const { getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await fireEvent.press(getByTestId("explore-sort-distance"))

      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: "distance" }),
        )
      })
    })
  })

  describe("empty states", () => {
    it("invites a first publication when the library itself is empty", async () => {
      mockSearch.mockResolvedValue(page([]))

      const { findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

      // "Widen the search" is actively misleading with no filter on — there is nothing
      // to widen towards.
      expect(await findByText(/no routes have been shared yet/i)).toBeTruthy()
    })

    it("offers to widen the search when a filter excluded everything", async () => {
      mockSearch.mockResolvedValue(page([]))

      const { getByTestId, findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await waitFor(() => expect(mockSearch).toHaveBeenCalled())

      await typeSearch(getByTestId, "nowhere")

      expect(await findByText(/no public routes match/i)).toBeTruthy()
    })
  })

  it("shows the server's error message and can retry", async () => {
    mockSearch.mockRejectedValueOnce(new Error("Could not reach the server."))

    const { findByText, getByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    mockSearch.mockResolvedValue(page([SKYE]))
    await fireEvent.press(getByTestId("explore-retry"))

    expect(await findByText("Skye circuit")).toBeTruthy()
  })

  describe("paging", () => {
    it("appends the next page rather than replacing the list", async () => {
      mockSearch.mockResolvedValue(page([SKYE], { pages: 2, total: 2 }))

      const { getByTestId, findByText, queryByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Skye circuit")

      mockSearch.mockResolvedValue({ items: [ARRAN], total: 2, page: 2, pages: 2 })
      await fireEvent.press(getByTestId("explore-load-more"))

      expect(await findByText("Arran loop")).toBeTruthy()
      // The first page is still on screen — this is a "load more", not a pager.
      expect(queryByText("Skye circuit")).toBeTruthy()
    })

    it("asks for the next page number when loading more", async () => {
      mockSearch.mockResolvedValue(page([SKYE], { pages: 3, total: 7 }))

      const { getByTestId, findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Skye circuit")

      await fireEvent.press(getByTestId("explore-load-more"))

      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
      })
    })

    it("offers no load-more on the last page", async () => {
      mockSearch.mockResolvedValue(page([SKYE], { pages: 1 }))

      const { findByText, queryByTestId } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Skye circuit")

      expect(queryByTestId("explore-load-more")).toBeNull()
    })

    it("starts again from page 1 when a filter changes", async () => {
      // Otherwise a filter applied while two pages deep asks for page 3 of a result set
      // that may only have one, and the user sees nothing for a query that matched.
      mockSearch.mockResolvedValue(page([SKYE], { pages: 3, total: 7 }))

      const { getByTestId, findByText } = await render(<ExploreScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Skye circuit")

      await fireEvent.press(getByTestId("explore-load-more"))
      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
      })

      await typeSearch(getByTestId, "arran")

      await waitFor(() => {
        expect(mockSearch).toHaveBeenLastCalledWith(
          expect.objectContaining({ name: "arran", page: 1 }),
        )
      })
    })
  })
})

// Explore is deliberately not cached, so offline is expected rather than a fault.
describe("ExploreScreen — offline", () => {
  // A retry button offline is a button that can only fail again; the search
  // re-runs by itself once the device reconnects instead.
  it("leaves the network error to the banner, with no retry button", async () => {
    mockUseIsOffline.mockReturnValue(true)
    mockSearch.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    const { findByText, queryByText, queryByTestId } = await render(<ExploreScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("Explore needs a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
    expect(queryByTestId("explore-retry")).toBeNull()
  })

  it("searches again by itself once the device reconnects", async () => {
    mockUseIsOffline.mockReturnValue(true)
    mockSearch.mockRejectedValueOnce(new Error(OFFLINE_ERROR_MESSAGE))
    mockSearch.mockResolvedValue(page([SKYE]))

    const { findByText, rerender } = await render(<ExploreScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("Explore needs a connection.")

    mockUseIsOffline.mockReturnValue(false)
    await rerender(<ExploreScreen />)

    expect(await findByText("Skye circuit")).toBeTruthy()
  })
})
