import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import EditPointScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/point/[pointId]"
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

  // M34 (revised): crew get the same screen now, read-only — mirroring web's
  // PointDetailModal `canEdit` split — rather than being turned away entirely.
  it("shows crew a read-only view instead of the edit form", async () => {
    mockIsLeader.mockResolvedValue(false)
    const { findByText, queryByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("position")).toBeTruthy()
    expect(queryByTestId("point-submit")).toBeNull()
    expect(queryByTestId("point-name")).toBeNull()
  })

  it("shows a point's notes to crew, read-only", async () => {
    mockIsLeader.mockResolvedValue(false)
    mockParams = { id: "trip-1", pointId: "a" }
    mockLoadRoute.mockResolvedValue({
      ...route(),
      points: route().points.map((p) =>
        p.id === "a" ? { ...p, notes: "Swell wraps round" } : p,
      ),
    })
    const { findByText } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Put-in")).toBeTruthy()
    expect(await findByText("Swell wraps round")).toBeTruthy()
  })

  it("shows a placeholder when crew's point has no notes", async () => {
    mockIsLeader.mockResolvedValue(false)
    mockParams = { id: "trip-1", pointId: "a" }
    const { findByText } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Put-in")).toBeTruthy()
    expect(await findByText("No notes for this point.")).toBeTruthy()
  })

  // M34: images aren't part of the offline-editable route (lib/itinerary/route-edits.ts's
  // EditablePoint has no images field) — itinerary.tsx's handleEditPoint hands them
  // over as a JSON route param instead of this screen fetching them itself.
  it("shows the photos handed over via the route param", async () => {
    mockParams = {
      id: "trip-1",
      pointId: "b",
      images: JSON.stringify([
        { id: "img-1", location: "https://example.com/a.jpg", caption: null },
      ]),
    }

    const { findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("photo-thumbnail-0")).toBeTruthy()
  })

  it("shows no photos section for a point with none", async () => {
    const { queryByTestId, findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await findByTestId("point-name")
    expect(queryByTestId("photo-thumbnail-0")).toBeNull()
  })

  // The param is trusted data from our own itinerary.tsx, but a screen must not
  // crash on it regardless — belt and suspenders against a malformed value.
  it("degrades to no photos on an unparseable images param", async () => {
    mockParams = { id: "trip-1", pointId: "b", images: "not json" }

    const { queryByTestId, findByTestId } = await render(<EditPointScreen />, { wrapper: WithCachedSurfaces })

    await findByTestId("point-name")
    expect(queryByTestId("photo-thumbnail-0")).toBeNull()
  })
})
