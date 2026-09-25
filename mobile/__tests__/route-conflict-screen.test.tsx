import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import RouteConflictScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/route-conflict"
import { fetchServerRoute, loadEditableRoute, resolveRouteConflict } from "../lib/db/route-edit"
import { isTripLeader } from "../lib/db/trip-role"
import type { EditableRoute } from "../lib/itinerary/route-edits"

const mockBack = jest.fn()
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
    useRouter: () => ({ back: mockBack }),
    useIsFocused: () => true,
  }
})
jest.mock("../lib/db/route-edit", () => ({
  loadEditableRoute: jest.fn(),
  fetchServerRoute: jest.fn(),
  resolveRouteConflict: jest.fn(),
}))
jest.mock("../lib/db/trip-role", () => ({ isTripLeader: jest.fn() }))
jest.mock("@maplibre/maplibre-react-native", () => {
  // Host-string stubs, as in explore-detail-screen.test.tsx.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require("react") as typeof import("react")
  const stub = (name: string) => {
    const Stub = ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      react.createElement(name, { testID }, children)
    Stub.displayName = name
    return Stub
  }
  return {
    Camera: stub("Camera"),
    Map: stub("Map"),
    Marker: ({ children, id }: { children?: React.ReactNode; id: string }) =>
      react.createElement("Marker", { testID: `marker-${id}` }, children),
    GeoJSONSource: stub("GeoJSONSource"),
    Layer: stub("Layer"),
  }
})

const mockLoadMine = loadEditableRoute as jest.Mock
const mockFetchTheirs = fetchServerRoute as jest.Mock
const mockResolve = resolveRouteConflict as jest.Mock
const mockIsLeader = isTripLeader as jest.Mock

function route(extra: { id: string; name: string } | null): EditableRoute {
  const points = [
    { id: "a", dayId: "d1", orderKey: "00001000", latitude: 42, longitude: 3, name: "Put-in", notes: null, type: "stop" },
    { id: "b", dayId: "d1", orderKey: "00002000", latitude: 42.1, longitude: 3.1, name: "Camp", notes: null, type: "stop" },
  ]
  if (extra) {
    points.push({ id: extra.id, dayId: "d1", orderKey: "00003000", latitude: 42.2, longitude: 3.2, name: extra.name, notes: null, type: "stop" })
  }
  return { days: [{ id: "d1", dayNumber: 1, date: null, startPointId: "a", endPointId: "b" }], points }
}

function confirm(buttonText: string) {
  const buttons = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)?.[2] as {
    text: string
    onPress?: () => Promise<void>
  }[]
  return buttons.find((button) => button.text === buttonText)?.onPress?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadMine.mockResolvedValue(route({ id: "beach", name: "Emergency beach" }))
  mockFetchTheirs.mockResolvedValue(route({ id: "island", name: "Island" }))
  mockResolve.mockResolvedValue(undefined)
  mockIsLeader.mockResolvedValue(true)
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

// Never a "keep mine / keep theirs" guess: the leader sees both routes and what
// differs before choosing (sync-protocol-spec.md §8.3).
describe("RouteConflictScreen", () => {
  it("draws both versions of the route on one map", async () => {
    const { findByTestId, getByTestId } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("route-mine")).toBeTruthy()
    expect(getByTestId("route-theirs")).toBeTruthy()
  })

  it("lists what exists only on this phone and only in the other version", async () => {
    const { findByText, getByText } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Emergency beach")).toBeTruthy()
    expect(getByText("Only on this phone")).toBeTruthy()
    expect(getByText("Island")).toBeTruthy()
    expect(getByText("Only in the other version")).toBeTruthy()
  })

  it("keeps the phone's route once confirmed", async () => {
    const { findByTestId } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("keep-mine"))
    await confirm("Keep my route")

    expect(mockResolve).toHaveBeenCalledWith("trip-1", "mine")
    expect(mockBack).toHaveBeenCalled()
  })

  it("takes the other version once confirmed", async () => {
    const { findByTestId } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("keep-theirs"))
    await confirm("Use the other version")

    expect(mockResolve).toHaveBeenCalledWith("trip-1", "theirs")
  })

  it("does nothing until the choice is confirmed", async () => {
    const { findByTestId } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("keep-mine"))

    expect(mockResolve).not.toHaveBeenCalled()
  })

  // Resolving needs the server anyway; the phone keeps its route meanwhile.
  it("says comparing needs a connection when offline", async () => {
    mockFetchTheirs.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    const { findByText, queryByTestId } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Comparing routes needs a connection.")).toBeTruthy()
    expect(queryByTestId("keep-mine")).toBeNull()
  })

  it("shows the reason when resolving fails", async () => {
    mockResolve.mockRejectedValue(new Error("Only trip leaders can perform this action"))
    const { findByTestId, findByText } = await render(<RouteConflictScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("keep-mine"))
    await confirm("Keep my route")

    expect(await findByText("Only trip leaders can perform this action")).toBeTruthy()
    await waitFor(() => expect(mockBack).not.toHaveBeenCalled())
  })
})
