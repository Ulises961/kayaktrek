import { render, screen, waitFor } from "@testing-library/react-native"

import type { LivePosition } from "@shared/dtos/live-position"

import { useIsFocused } from "expo-router"

import { getSession } from "@mobile/lib/auth/session"
import { crewMarkerLabel, STALE_AFTER_MS } from "@mobile/lib/live/crew-position-label"
import { useCrewPositions } from "@mobile/lib/live/use-crew-positions"
import { useOwnPosition } from "@mobile/lib/live/use-own-position"

import { CrewPositionMarkers } from "../crew-position-markers"

jest.mock("@maplibre/maplibre-react-native", () => ({
  // React Native is required when it renders: the factory runs while react-native is itself still loading.
  ViewAnnotation: ({ id, lngLat, children }: { id: string; lngLat: number[]; children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see the comment above
    const { View } = require("react-native")
    return (
      <View testID={`annotation-${id}`} accessibilityLabel={lngLat.join(",")}>
        {children}
      </View>
    )
  },
}))
jest.mock("expo-router", () => ({ useIsFocused: jest.fn() }))
jest.mock("@mobile/lib/auth/session", () => ({ getSession: jest.fn() }))
jest.mock("@mobile/lib/live/use-crew-positions", () => ({ useCrewPositions: jest.fn() }))
jest.mock("@mobile/lib/live/use-own-position", () => ({ useOwnPosition: jest.fn() }))

const NOW = Date.parse("2026-11-06T10:30:00Z")

function crew(userId: string, name: string, minutesAgo: number): LivePosition {
  return {
    userId,
    name,
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(getSession).mockResolvedValue({ userId: "me", email: "me@example.com" })
  jest.mocked(useIsFocused).mockReturnValue(true)
  jest.mocked(useCrewPositions).mockReturnValue([])
  jest.mocked(useOwnPosition).mockReturnValue(null)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("CrewPositionMarkers", () => {
  it("polls and watches only while the trip is under way", async () => {
    await render(<CrewPositionMarkers tripId="trip-1" live={false} />)

    expect(useCrewPositions).toHaveBeenCalledWith("trip-1", false)
    expect(useOwnPosition).toHaveBeenCalledWith(false)
    expect(screen.queryByTestId(/^annotation-/)).toBeNull()
  })

  it("stops polling and watching while another screen is on top of the map", async () => {
    jest.mocked(useIsFocused).mockReturnValue(false)

    await render(<CrewPositionMarkers tripId="trip-1" live />)

    expect(useCrewPositions).toHaveBeenCalledWith("trip-1", false)
    expect(useOwnPosition).toHaveBeenCalledWith(false)
  })

  it("puts each crew member on the map where they were last heard, labelled with name and age", async () => {
    const ada = crew("u1", "Ada Paddler", 2)
    jest.mocked(useCrewPositions).mockReturnValue([ada])

    await render(<CrewPositionMarkers tripId="trip-1" live />)

    expect(useCrewPositions).toHaveBeenCalledWith("trip-1", true)
    expect(screen.getByTestId("annotation-crew-u1").props.accessibilityLabel).toBe("13.2,43.1")
    expect(screen.getByText(crewMarkerLabel(ada, NOW).text)).toBeTruthy()
  })

  it("draws a member not heard from for a while quieter than one who was", async () => {
    jest.mocked(useCrewPositions).mockReturnValue([
      crew("fresh", "Ada Paddler", 1),
      crew("quiet", "Bea Paddler", STALE_AFTER_MS / 60_000 + 1),
    ])

    await render(<CrewPositionMarkers tripId="trip-1" live />)

    const opacityOf = (userId: string) => {
      const style = screen.getByTestId(`crew-dot-${userId}`).props.style
      return [style].flat().reduce((found: number | undefined, entry) => entry?.opacity ?? found, undefined)
    }
    expect(opacityOf("fresh")).toBe(1)
    expect(opacityOf("quiet")).toBeLessThan(opacityOf("fresh") as number)
  })

  it("does not draw the signed-in paddler as crew: their own marker comes from the phone's own fix", async () => {
    jest.mocked(useCrewPositions).mockReturnValue([crew("me", "Me Myself", 1), crew("u1", "Ada Paddler", 1)])

    await render(<CrewPositionMarkers tripId="trip-1" live />)

    await waitFor(() => expect(screen.queryByTestId("annotation-crew-me")).toBeNull())
    expect(screen.getByTestId("annotation-crew-u1")).toBeTruthy()
  })

  it("draws the paddler's own marker at the phone's own fix", async () => {
    jest.mocked(useOwnPosition).mockReturnValue({ latitude: 43.5, longitude: 13.6, accuracyM: 5 })

    await render(<CrewPositionMarkers tripId="trip-1" live />)

    expect(screen.getByTestId("annotation-own-position").props.accessibilityLabel).toBe("13.6,43.5")
  })

  it("draws no marker of its own until the phone has a fix", async () => {
    await render(<CrewPositionMarkers tripId="trip-1" live />)

    expect(screen.queryByTestId("annotation-own-position")).toBeNull()
  })
})
