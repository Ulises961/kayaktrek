import { render, waitFor } from "@testing-library/react-native"

import { WithOfflineBanner } from "../test-utils/with-offline-banner"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import { DIFFICULTIES, DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import { DISTANCE_UNIT, formatDistance } from "@shared/itinerary/distance"

import PublicRouteScreen from "../app/(app)/(drawer)/(explore)/explore/[id]"
import { fetchPublicItineraryDetail } from "../lib/explore/actions"
import { getMe } from "../lib/profile/actions"

jest.mock("../lib/explore/actions", () => ({
  fetchPublicItineraryDetail: jest.fn(),
}))
jest.mock("../lib/profile/actions", () => ({
  getMe: jest.fn(),
}))
// Re-stubs Stack.Screen as well as supplying the params: a local expo-router mock
// replaces jest.setup.ts's global one wholesale, and without the stub the real
// Stack.Screen calls useRoute outside any navigator.
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "itin-1" }),
    useIsFocused: () => true,
  }
})
jest.mock("@maplibre/maplibre-react-native", () => {
  // Host-string elements rather than react-native's View: requiring react-native inside
  // a mock factory re-enters react-native-css's component wrapper before it is ready and
  // throws from copyComponentProperties.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require("react") as typeof import("react")
  // Forwards testID so a test can assert a given map layer is in the tree; a stub that
  // swallowed props would make every such assertion silently unreachable.
  const stub = (name: string) => {
    const Stub = ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      react.createElement(name, { testID }, children)
    Stub.displayName = name
    return Stub
  }
  return {
    Camera: stub("Camera"),
    Map: stub("Map"),
    // Keyed by the marker's own id, so a test can count how many times one point is drawn.
    Marker: ({ children, id }: { children?: React.ReactNode; id: string }) =>
      react.createElement("Marker", { testID: `marker-${id}` }, children),
    GeoJSONSource: stub("GeoJSONSource"),
    Layer: stub("Layer"),
  }
})

const mockFetch = fetchPublicItineraryDetail as jest.Mock
const mockGetMe = getMe as jest.Mock

const UNIT = DISTANCE_UNIT.NM

// Two stops a measurable distance apart, so the day's leg distance is a real number
// rather than zero.
const DAY_ONE = {
  dayNumber: 1,
  date: "2026-07-01",
  points: [
    { id: "p1", latitude: 57.0, longitude: -6.0, type: "stop", name: "Elgol", images: [] },
    { id: "p2", latitude: 57.1, longitude: -6.0, type: "position", name: null, images: [] },
    { id: "p3", latitude: 57.2, longitude: -6.0, type: "stop", name: "Loch Coruisk", images: [] },
  ],
}

const DAY_TWO = {
  dayNumber: 2,
  date: "2026-07-02",
  points: [
    { id: "p3", latitude: 57.2, longitude: -6.0, type: "stop", name: "Loch Coruisk", images: [] },
    { id: "p4", latitude: 57.35, longitude: -6.0, type: "stop", name: "Soay", images: [] },
  ],
}

const DETAIL = {
  id: "itin-1",
  name: "Skye circuit",
  description: "Three days around the Cuillin coast, launching from Elgol.",
  difficulty: DIFFICULTIES[1],
  totalMiles: 42.5,
  avgSpeedKnots: 3,
  days: [DAY_ONE, DAY_TWO],
  places: [],
}

beforeEach(() => {
  mockFetch.mockReset()
  mockGetMe.mockReset()
  mockGetMe.mockResolvedValue({ unitPreference: UNIT })
})

describe("PublicRouteScreen", () => {
  it("shows the route's name, pitch and grade", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("Skye circuit")).toBeTruthy()
    expect(await findByText(DETAIL.description)).toBeTruthy()
    expect(await findByText(DIFFICULTY_LABELS[DIFFICULTIES[1]])).toBeTruthy()
  })

  it("shows the description in full rather than clamping it like the listing card", async () => {
    // This is the screen someone opened in order to read the pitch.
    mockFetch.mockResolvedValue(DETAIL)

    const { findByTestId } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    expect((await findByTestId("route-pitch")).props.numberOfLines).toBeUndefined()
  })

  it("shows the total distance in the viewer's own unit", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText(new RegExp(formatDistance(DETAIL.totalMiles, UNIT)))).toBeTruthy()
  })

  it("fetches the route named in the route params", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("itin-1"))
  })

  describe("daily breakdown", () => {
    it("lists every day of the route", async () => {
      mockFetch.mockResolvedValue(DETAIL)

      const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

      expect(await findByText("Day 1")).toBeTruthy()
      expect(await findByText("Day 2")).toBeTruthy()
    })

    it("names the stops so the route reads as places, not coordinates", async () => {
      mockFetch.mockResolvedValue(DETAIL)

      const { findByText, findAllByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

      expect(await findByText("Elgol")).toBeTruthy()
      // Loch Coruisk ends day 1 and starts day 2.
      expect((await findAllByText("Loch Coruisk")).length).toBeGreaterThan(0)
      expect(await findByText("Soay")).toBeTruthy()
    })

    it("gives each day its own distance, not just the route total", async () => {
      mockFetch.mockResolvedValue(DETAIL)

      const { findByTestId } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

      const dayOne = await findByTestId("day-distance-1")
      const dayTwo = await findByTestId("day-distance-2")
      // Day 2 spans 0.15° of latitude against day 1's 0.2°, so they must differ — a
      // breakdown that prints the same number for every day is showing the total.
      expect(dayOne.props.children).not.toEqual(dayTwo.props.children)
    })

    it("falls back to a bare distance when the route has no planning speed", async () => {
      // legLabel divides by avgSpeedKnots; an older route may never have had one set.
      mockFetch.mockResolvedValue({ ...DETAIL, avgSpeedKnots: null })

      const { findByTestId } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

      expect(await findByTestId("day-distance-1")).toBeTruthy()
    })

    it("says so when a published route carries no days at all", async () => {
      mockFetch.mockResolvedValue({ ...DETAIL, days: [] })

      const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

      expect(await findByText(/no route detail/i)).toBeTruthy()
    })
  })

  it("draws the route as a connected line, not just loose markers", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    const { findByTestId } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    // Markers alone leave a reader to guess the order the points join in.
    expect(await findByTestId("route-line")).toBeTruthy()
  })

  // An overnight stop ends one day and starts the next, so it sits in both days'
  // segments (Loch Coruisk, p3, in the fixtures). Drawn once per day, it gave two
  // Markers the same key and id, which crashed the screen on a device.
  it("draws an overnight stop shared by two days as a single marker", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    const { findByText, getAllByTestId } = await render(<PublicRouteScreen />)
    await findByText("Skye circuit")

    expect(getAllByTestId("marker-p3")).toHaveLength(1)
    for (const id of ["p1", "p2", "p4"]) {
      expect(getAllByTestId(`marker-${id}`)).toHaveLength(1)
    }
  })

  it("shows the error rather than an empty map when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  it("still renders a route whose points carry no coordinates", async () => {
    // A published route can hold points that were never placed on the map. The screen
    // has to survive that rather than crash building a bounding box from nulls.
    mockFetch.mockResolvedValue({
      ...DETAIL,
      days: [{ dayNumber: 1, points: [{ id: "p1", latitude: null, longitude: null, images: [] }] }],
    })

    const { findByText } = await render(<PublicRouteScreen />, { wrapper: WithOfflineBanner })

    expect(await findByText("Skye circuit")).toBeTruthy()
  })
})

describe("PublicRouteScreen — offline", () => {
  it("leaves the network error to the banner", async () => {
    mockFetch.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    const { findByText, queryByText } = await render(<PublicRouteScreen />, {
      wrapper: WithOfflineBanner,
    })

    expect(await findByText("Explore needs a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
  })
})
