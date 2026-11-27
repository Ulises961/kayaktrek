import { act, render, screen } from "@testing-library/react-native"
import { useIsFocused } from "expo-router"

import type { LivePosition } from "@shared/dtos/live-position"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import LiveScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/(tabs)/live"
import { loadOfflineCrew, type OfflineCrewMember } from "../lib/db/offline-float-plan"
import { isTripLeader } from "../lib/db/trip-role"
import { formatAge } from "../lib/live/position/sharing-status"
import { useCrewPositions } from "../lib/live/use-crew-positions"
import { useTripChanges } from "../lib/live/use-trip-changes"

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
    useIsFocused: jest.fn(),
  }
})
jest.mock("../lib/db/offline-float-plan", () => ({ loadOfflineCrew: jest.fn() }))
jest.mock("../lib/db/trip-role", () => ({ isTripLeader: jest.fn() }))
jest.mock("../lib/live/use-crew-positions", () => ({ useCrewPositions: jest.fn() }))
jest.mock("../lib/live/use-trip-changes", () => ({ useTripChanges: jest.fn() }))
// The cards have their own tests; here only what the screen puts on it, and for whom, matters.
jest.mock("../components/live/sharing-card", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native")
  return { SharingCard: ({ tripId }: { tripId: string }) => <Text testID="sharing-card">{tripId}</Text> }
})
jest.mock("../components/live/close-day-card", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native")
  return { CloseDayCard: ({ tripId }: { tripId: string }) => <Text testID="close-day-card">{tripId}</Text> }
})

const mockLoadCrew = loadOfflineCrew as jest.Mock
const mockIsLeader = isTripLeader as jest.Mock
const mockUseCrewPositions = useCrewPositions as jest.Mock
const mockUseTripChanges = useTripChanges as jest.Mock
const mockUseIsFocused = useIsFocused as jest.Mock

function member(userId: string, name: string, role = "crew"): OfflineCrewMember {
  return {
    id: `member-${userId}`,
    role,
    user: { id: userId, name, surname: "Paddler", username: name.toLowerCase() },
    vesselMake: null,
    vesselModel: null,
    vesselLengthCm: null,
    vesselColorPrimary: null,
    vesselColorSecondary: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    leftAt: null,
    leftNote: null,
  }
}

function heard(userId: string, minutesAgo: number): LivePosition {
  return {
    userId,
    name: "Ada Paddler",
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }
}

function renderScreen() {
  return render(<LiveScreen />, { wrapper: WithCachedSurfaces })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseIsFocused.mockReturnValue(true)
  mockLoadCrew.mockResolvedValue([member("u1", "Ada", "leader"), member("u2", "Bea")])
  mockIsLeader.mockResolvedValue(false)
  mockUseCrewPositions.mockReturnValue([])
})

describe("LiveScreen", () => {
  it("offers to share the paddler's position for this trip", async () => {
    await renderScreen()

    expect((await screen.findByTestId("sharing-card")).props.children).toBe("trip-1")
  })

  it("lists the crew with how long ago each was last heard from, and who has not shared at all", async () => {
    mockUseCrewPositions.mockReturnValue([heard("u1", 3)])

    await renderScreen()

    expect(await screen.findByText("Ada Paddler")).toBeTruthy()
    expect(screen.getByText(formatAge(3 * 60_000))).toBeTruthy()
    expect(screen.getByText("Bea Paddler")).toBeTruthy()
    expect(screen.getByText("No position shared yet")).toBeTruthy()
  })

  it("polls the crew's positions while the screen is on top, and not while another screen covers it", async () => {
    await renderScreen()
    expect(mockUseCrewPositions).toHaveBeenLastCalledWith("trip-1", true)

    mockUseIsFocused.mockReturnValue(false)
    await renderScreen()

    expect(mockUseCrewPositions).toHaveBeenLastCalledWith("trip-1", false)
  })

  it("gives the leader the close-day action, for this trip", async () => {
    mockIsLeader.mockResolvedValue(true)

    await renderScreen()

    expect((await screen.findByTestId("close-day-card")).props.children).toBe("trip-1")
  })

  it("gives crew no close-day action", async () => {
    await renderScreen()
    await screen.findByText("Ada Paddler")

    expect(screen.queryByTestId("close-day-card")).toBeNull()
  })

  it("re-reads the crew when the crew changes, so a member who joined or left shows at once", async () => {
    await renderScreen()
    await screen.findByText("Bea Paddler")
    expect(mockUseTripChanges).toHaveBeenCalledWith("trip-1", expect.any(Function), { tables: ["trip_member"] })
    mockLoadCrew.mockResolvedValue([member("u1", "Ada", "leader")])

    await act(async () => {
      mockUseTripChanges.mock.calls.at(-1)?.[1]()
    })

    expect(await screen.findByText("Ada Paddler")).toBeTruthy()
    expect(screen.queryByText("Bea Paddler")).toBeNull()
  })

  it("still shows the sharing card, with the crew empty, when the crew cannot be read", async () => {
    mockLoadCrew.mockRejectedValue(new Error("database unavailable"))

    await renderScreen()

    expect(await screen.findByTestId("sharing-card")).toBeTruthy()
    expect(await screen.findByText("No crew on this phone yet.")).toBeTruthy()
  })
})
