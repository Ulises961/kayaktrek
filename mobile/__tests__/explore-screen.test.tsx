import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { DIFFICULTIES } from "@shared/dtos/difficulty"
import { DISTANCE_UNIT, formatDistance } from "@shared/itinerary/distance"

import ExploreScreen from "../app/(app)/(drawer)/(explore)/explore/index"
import { searchPublicItineraries } from "../lib/explore/actions"
import { getMe } from "../lib/profile/actions"

jest.mock("../lib/explore/actions", () => ({
  searchPublicItineraries: jest.fn(),
}))
jest.mock("../lib/profile/actions", () => ({
  getMe: jest.fn(),
}))

const mockSearch = searchPublicItineraries as jest.Mock
const mockGetMe = getMe as jest.Mock

function page(items: unknown[], overrides: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

const SKYE = {
  id: "itin-1",
  name: "Skye circuit",
  description: "Three days around the Cuillin coast.",
  difficulty: DIFFICULTIES[1],
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

const UNIT = DISTANCE_UNIT.NM

beforeEach(() => {
  mockSearch.mockReset()
  mockGetMe.mockReset()
  mockGetMe.mockResolvedValue({ unitPreference: UNIT })
})

describe("ExploreScreen", () => {
  it("lists the published routes returned by the search", async () => {
    mockSearch.mockResolvedValue(page([SKYE]))

    const { findByText } = await render(<ExploreScreen />)

    expect(await findByText("Skye circuit")).toBeTruthy()
    expect(await findByText("Three days around the Cuillin coast.")).toBeTruthy()
  })

  it("shows the route's own signals rather than leaving the card bare", async () => {
    mockSearch.mockResolvedValue(page([SKYE]))

    const { findByText } = await render(<ExploreScreen />)

    // The three signals M23 added because description and difficulty are null on real
    // routes: total distance, day count, and the hardest day rather than the average.
    expect(await findByText(new RegExp(formatDistance(SKYE.totalMiles, UNIT)))).toBeTruthy()
    expect(await findByText(/3 days/)).toBeTruthy()
    expect(await findByText(new RegExp(`Longest day ${formatDistance(SKYE.longestDayMiles, UNIT)}`))).toBeTruthy()
  })

  it("searches by name when the query changes", async () => {
    mockSearch.mockResolvedValue(page([]))

    const { getByTestId } = await render(<ExploreScreen />)
    await waitFor(() => expect(mockSearch).toHaveBeenCalled())

    await fireEvent.changeText(getByTestId("explore-search"), "skye")
    await fireEvent(getByTestId("explore-search"), "submitEditing")

    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ name: "skye" }))
    })
  })

  it("distinguishes an empty library from a failed request", async () => {
    mockSearch.mockResolvedValue(page([]))

    const { findByText } = await render(<ExploreScreen />)

    expect(await findByText(/no published routes/i)).toBeTruthy()
  })

  it("shows the server's error message and can retry", async () => {
    mockSearch.mockRejectedValueOnce(new Error("Could not reach the server."))

    const { findByText, getByTestId } = await render(<ExploreScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    mockSearch.mockResolvedValue(page([SKYE]))
    await fireEvent.press(getByTestId("explore-retry"))

    expect(await findByText("Skye circuit")).toBeTruthy()
  })

  it("pages forward without losing the active search", async () => {
    mockSearch.mockResolvedValue(page([SKYE], { pages: 3, total: 7 }))

    const { getByTestId } = await render(<ExploreScreen />)
    await waitFor(() => expect(mockSearch).toHaveBeenCalled())

    await fireEvent.changeText(getByTestId("explore-search"), "skye")
    await fireEvent(getByTestId("explore-search"), "submitEditing")
    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ name: "skye" }))
    })

    await fireEvent.press(getByTestId("explore-next-page"))

    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "skye", page: 2 }),
      )
    })
  })

  it("returns to page 1 when a new search is submitted", async () => {
    // Otherwise a search made while on page 3 asks for page 3 of a result set that may
    // only have one page, and the user sees an empty list for a query that matched.
    mockSearch.mockResolvedValue(page([SKYE], { pages: 3 }))

    const { getByTestId } = await render(<ExploreScreen />)
    await waitFor(() => expect(mockSearch).toHaveBeenCalled())

    await fireEvent.press(getByTestId("explore-next-page"))
    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    })

    await fireEvent.changeText(getByTestId("explore-search"), "arran")
    await fireEvent(getByTestId("explore-search"), "submitEditing")

    await waitFor(() => {
      expect(mockSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "arran", page: 1 }),
      )
    })
  })
})
