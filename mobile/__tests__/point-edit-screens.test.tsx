import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import EditPointScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/point/[pointId]"
import NewPointScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/point/new"
import { editRoute, loadEditableRoute, pushRouteChanges } from "../lib/db/route-edit"
import { isTripLeader } from "../lib/db/trip-role"
import type { EditableRoute } from "../lib/itinerary/route-edits"

const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: mockBack }),
    useIsFocused: () => true,
  }
})
jest.mock("../lib/db/route-edit", () => ({
  loadEditableRoute: jest.fn(),
  editRoute: jest.fn(),
  pushRouteChanges: jest.fn(),
}))
jest.mock("../lib/db/trip-role", () => ({ isTripLeader: jest.fn() }))

const mockLoadRoute = loadEditableRoute as jest.Mock
const mockEditRoute = editRoute as jest.Mock
const mockPush = pushRouteChanges as jest.Mock
const mockIsLeader = isTripLeader as jest.Mock

function route(): EditableRoute {
  return {
    days: [
      { id: "d1", dayNumber: 1, date: null, startPointId: "a", endPointId: "c" },
      { id: "d2", dayNumber: 2, date: null, startPointId: "c", endPointId: "d" },
    ],
    points: [
      { id: "a", dayId: "d1", orderKey: "00001000", latitude: 42, longitude: 3, name: "Put-in", notes: null, type: "stop" },
      { id: "b", dayId: "d1", orderKey: "00002000", latitude: 42.1, longitude: 3.1, name: "Cape", notes: null, type: "position" },
      { id: "c", dayId: "d2", orderKey: "00003000", latitude: 42.2, longitude: 3.2, name: "Camp", notes: null, type: "stop" },
      { id: "d", dayId: "d2", orderKey: "00004000", latitude: 42.3, longitude: 3.3, name: "Take-out", notes: null, type: "stop" },
    ],
  }
}

// What the screen asked editRoute to do, applied to the fixture route.
function editedRoute(): EditableRoute {
  const edit = mockEditRoute.mock.calls.at(-1)?.[1] as (r: EditableRoute) => EditableRoute
  return edit(route())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadRoute.mockResolvedValue(route())
  mockEditRoute.mockResolvedValue(route())
  mockPush.mockResolvedValue("pushed")
  mockIsLeader.mockResolvedValue(true)
})

describe("EditPointScreen", () => {
  beforeEach(() => {
    mockParams = { id: "trip-1", pointId: "b" }
  })

  it("saves a new name, type and notes to the local route", async () => {
    const { findByTestId, getByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.changeText(await findByTestId("point-name"), "Cap de Creus")
    await fireEvent.press(getByTestId("point-type-stop"))
    await fireEvent.changeText(getByTestId("point-notes"), "Swell wraps round")
    await fireEvent.press(getByTestId("point-submit"))

    await waitFor(() => expect(mockEditRoute).toHaveBeenCalled())
    expect(mockEditRoute.mock.calls[0][0]).toBe("trip-1")
    expect(editedRoute().points.find((p) => p.id === "b")).toMatchObject({
      name: "Cap de Creus",
      type: "stop",
      notes: "Swell wraps round",
    })
    expect(mockBack).toHaveBeenCalled()
  })

  it("moves the point to another day", async () => {
    const { findByTestId, getByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("point-day-2"))
    await fireEvent.press(getByTestId("point-submit"))

    await waitFor(() => expect(mockEditRoute).toHaveBeenCalled())
    expect(editedRoute().points.find((p) => p.id === "b")!.dayId).toBe("d2")
  })

  it("tries to push the change straight away", async () => {
    const { findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("point-submit"))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("trip-1"))
  })

  // Offline, the push fails; the edit is on the phone and goes up later.
  it("keeps the edit when the push can't reach the server", async () => {
    mockPush.mockRejectedValue(new Error("Could not reach the server."))
    const { findByTestId, queryByText } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("point-submit"))

    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    expect(queryByText(/Could not reach/)).toBeNull()
  })

  it("deletes the point after confirmation", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})
    const { findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("point-delete"))
    const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => Promise<void> }[]
    await buttons.find((button) => button.text === "Delete")?.onPress?.()

    expect(editedRoute().points.map((p) => p.id)).toEqual(["a", "c", "d"])
  })

  it("moves the point later within its day", async () => {
    mockParams = { id: "trip-1", pointId: "a" }
    const { findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(await findByTestId("point-move-later"))

    await waitFor(() => expect(mockEditRoute).toHaveBeenCalled())
    const order = [...editedRoute().points]
      .sort((x, y) => (x.orderKey ?? "").localeCompare(y.orderKey ?? ""))
      .map((p) => p.id)
    expect(order).toEqual(["b", "a", "c", "d"])
  })

  it("offers no editing to crew", async () => {
    mockIsLeader.mockResolvedValue(false)
    const { findByText, queryByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Only the trip leader can change the route.")).toBeTruthy()
    expect(queryByTestId("point-submit")).toBeNull()
  })
})

describe("NewPointScreen", () => {
  beforeEach(() => {
    mockParams = { id: "trip-1", dayId: "d1", latitude: "42.11", longitude: "3.11" }
  })

  // The emergency stop: added where the paddler is, into the chosen day, after the
  // day's stop nearest to it.
  it("adds a stop at the given position, after the day's nearest stop", async () => {
    const { findByTestId, getByTestId } = await render(<NewPointScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.changeText(await findByTestId("point-name"), "Sheltered beach")
    await fireEvent.press(getByTestId("point-submit"))

    await waitFor(() => expect(mockEditRoute).toHaveBeenCalled())
    const edited = editedRoute()
    const order = [...edited.points]
      .sort((x, y) => (x.orderKey ?? "").localeCompare(y.orderKey ?? ""))
      .map((p) => p.name)
    expect(order).toEqual(["Put-in", "Cape", "Sheltered beach", "Camp", "Take-out"])
    const added = edited.points.find((p) => p.name === "Sheltered beach")!
    expect(added).toMatchObject({ dayId: "d1", latitude: 42.11, longitude: 3.11, type: "stop" })
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(mockBack).toHaveBeenCalled()
  })
})
