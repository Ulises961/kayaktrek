import { render, waitFor } from "@testing-library/react-native"

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
  }
})
// MapLibre ships untranspiled ESM and is not in jest's transform allowlist. Stubbed to
// plain views: this screen's assertions are about the route summary, and a real GL map
// renders nothing a query could reach anyway. This is the first test in the suite to
// render a map at all — the itinerary screen has never had one.
jest.mock("@maplibre/maplibre-react-native", () => {
  // Host-string elements rather than react-native's View: requiring react-native inside
  // a mock factory re-enters react-native-css's component wrapper before it is ready and
  // throws from copyComponentProperties.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require("react") as typeof import("react")
  const stub = (name: string) => {
    const Stub = ({ children }: { children?: React.ReactNode }) =>
      react.createElement(name, null, children)
    Stub.displayName = name
    return Stub
  }
  return { Camera: stub("Camera"), Map: stub("Map"), Marker: stub("Marker") }
})

const mockFetch = fetchPublicItineraryDetail as jest.Mock
const mockGetMe = getMe as jest.Mock

const UNIT = DISTANCE_UNIT.NM

const DETAIL = {
  id: "itin-1",
  name: "Skye circuit",
  description: "Three days around the Cuillin coast.",
  difficulty: DIFFICULTIES[1],
  totalMiles: 42.5,
  days: [
    {
      dayNumber: 1,
      points: [
        { id: "p1", latitude: 57.2, longitude: -6.3, type: "stop", images: [] },
        { id: "p2", latitude: 57.3, longitude: -6.1, type: "position", images: [] },
      ],
    },
  ],
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

    const { findByText } = await render(<PublicRouteScreen />)

    expect(await findByText("Skye circuit")).toBeTruthy()
    expect(await findByText("Three days around the Cuillin coast.")).toBeTruthy()
    expect(await findByText(DIFFICULTY_LABELS[DIFFICULTIES[1]])).toBeTruthy()
  })

  it("shows the total distance in the viewer's own unit", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    const { findByText } = await render(<PublicRouteScreen />)

    expect(
      await findByText(new RegExp(formatDistance(DETAIL.totalMiles, UNIT))),
    ).toBeTruthy()
  })

  it("fetches the route named in the route params", async () => {
    mockFetch.mockResolvedValue(DETAIL)

    await render(<PublicRouteScreen />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("itin-1"))
  })

  it("shows the error rather than an empty map when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<PublicRouteScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  it("still renders a route whose points carry no coordinates", async () => {
    // A published route can hold points that were never placed on the map. The screen
    // has to survive that rather than crash building a bounding box from nulls.
    mockFetch.mockResolvedValue({
      ...DETAIL,
      days: [{ dayNumber: 1, points: [{ id: "p1", latitude: null, longitude: null, images: [] }] }],
    })

    const { findByText } = await render(<PublicRouteScreen />)

    expect(await findByText("Skye circuit")).toBeTruthy()
  })
})
