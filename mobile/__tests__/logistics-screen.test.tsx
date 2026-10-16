import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import LogisticsScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/logistics"
import { getSession } from "../lib/auth/session"
import {
  createShuttleVehicle,
  createTravelDocument,
  deleteTravelDocument,
  getShuttleVehicles,
  getTravelDocuments,
} from "../lib/logistics/actions"
import { getTrip } from "../lib/trips/actions"
import { loadLogisticsCache } from "../lib/db/logistics-cache"
import { readCachedAt } from "../lib/db/cache-freshness"

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
    useIsFocused: () => true,
  }
})
jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
}))
jest.mock("../lib/db/logistics-cache", () => ({ loadLogisticsCache: jest.fn() }))
jest.mock("../lib/db/offline-float-plan", () => ({ loadOfflineCrew: jest.fn(async () => []) }))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))
jest.mock("../lib/logistics/actions", () => ({
  getTravelDocuments: jest.fn(),
  getShuttleVehicles: jest.fn(),
  createTravelDocument: jest.fn(),
  deleteTravelDocument: jest.fn(),
  createShuttleVehicle: jest.fn(),
  deleteShuttleVehicle: jest.fn(),
  addShuttlePassenger: jest.fn(),
  removeShuttlePassenger: jest.fn(),
}))

const mockGetTrip = getTrip as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockGetTravelDocuments = getTravelDocuments as jest.Mock
const mockGetShuttleVehicles = getShuttleVehicles as jest.Mock
const mockCreateTravelDocument = createTravelDocument as jest.Mock
const mockDeleteTravelDocument = deleteTravelDocument as jest.Mock
const mockCreateShuttleVehicle = createShuttleVehicle as jest.Mock
const mockLoadLogisticsCache = loadLogisticsCache as jest.Mock
const mockReadCachedAt = readCachedAt as jest.Mock

const LEADER = { id: "m-leader", role: "leader", user: { id: "leader-1", name: "Lea", surname: "Der" } }

beforeEach(() => {
  mockGetTrip.mockReset()
  mockGetSession.mockReset()
  mockGetTravelDocuments.mockReset()
  mockGetShuttleVehicles.mockReset()
  mockCreateTravelDocument.mockReset()
  mockDeleteTravelDocument.mockReset()
  mockCreateShuttleVehicle.mockReset()
  mockGetTrip.mockResolvedValue({ id: "trip-1", travellers: [LEADER] })
  mockGetSession.mockResolvedValue({ userId: "leader-1" })
  // Never cached, unless a test says otherwise: an empty cache with no
  // recorded sync is "nothing to show", so the error paths stay reachable.
  mockLoadLogisticsCache.mockReset().mockResolvedValue({ documents: [], vehicles: [] })
  mockReadCachedAt.mockResolvedValue(null)
})

describe("LogisticsScreen", () => {
  it("shows empty panels for both sections when there is nothing yet", async () => {
    mockGetTravelDocuments.mockResolvedValue([])
    mockGetShuttleVehicles.mockResolvedValue([])

    const { findByText } = await render(<LogisticsScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("No travel documents yet")).toBeTruthy()
    expect(await findByText("No vehicles yet")).toBeTruthy()
  })

  it("lists travel documents and shuttle vehicles once loaded", async () => {
    mockGetTravelDocuments.mockResolvedValue([
      { id: "doc-1", type: "permit", name: "National park permit", ownerId: "leader-1" },
    ])
    mockGetShuttleVehicles.mockResolvedValue([
      {
        id: "veh-1",
        arrangedById: "m-leader",
        driverName: "Lea",
        seatsAvailable: 4,
        kayakSpots: 2,
        passengers: [],
      },
    ])

    const { findByText } = await render(<LogisticsScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("National park permit")).toBeTruthy()
    expect(await findByText("Driver: Lea")).toBeTruthy()
  })

  it("adds a travel document and reflects it in the list without a second full load", async () => {
    mockGetTravelDocuments.mockResolvedValue([])
    mockGetShuttleVehicles.mockResolvedValue([])
    mockCreateTravelDocument.mockResolvedValue({
      id: "doc-new",
      type: "accommodation",
      name: "Hostel booking",
      ownerId: "leader-1",
    })

    const { findByText, getByText, getByLabelText, findByPlaceholderText } = await render(
      <LogisticsScreen />,
      { wrapper: WithCachedSurfaces },
    )
    await findByText("No travel documents yet")

    await fireEvent.press(getByLabelText("Add travel document"))
    const nameInput = await findByPlaceholderText("Name (e.g. Ferry booking)")
    await fireEvent.changeText(nameInput, "Hostel booking")
    await waitFor(() => expect(nameInput.props.value).toBe("Hostel booking"))
    await fireEvent.press(getByText("Add document"))

    await waitFor(() => {
      expect(mockCreateTravelDocument).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ type: "accommodation", name: "Hostel booking" }),
      )
    })
    expect(await findByText("Hostel booking")).toBeTruthy()
  })

  it("surfaces a thrown error from the initial load", async () => {
    mockGetTravelDocuments.mockRejectedValue(new Error("Could not reach the server."))
    mockGetShuttleVehicles.mockResolvedValue([])

    const { findByText } = await render(<LogisticsScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})

describe("LogisticsScreen — offline", () => {
  const CACHED = {
    documents: [
      { id: "doc-1", ownerId: "leader-1", type: "permit", name: "National park permit" },
    ],
    vehicles: [
      {
        id: "veh-1",
        arrangedById: "m-leader",
        driverName: "Lea",
        seatsAvailable: 4,
        kayakSpots: 2,
        passengers: [],
      },
    ],
  }

  // "Which van am I in, and where is the pickup" is asked on departure
  // morning — exactly when signal is thinnest.
  it("falls back to the cached documents and vehicles, with their age", async () => {
    mockGetTravelDocuments.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockLoadLogisticsCache.mockResolvedValue(CACHED)
    mockReadCachedAt.mockResolvedValue(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())

    const { findByText, getByText, queryByText } = await render(<LogisticsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("National park permit")).toBeTruthy()
    expect(getByText("Driver: Lea")).toBeTruthy()
    expect(getByText("Last synced 2 days ago.")).toBeTruthy()
    expect(queryByText("Logistics needs a connection.")).toBeNull()
  })

  // Adding, deleting, joining and leaving all need the server.
  it("offers no mutation while showing the cached logistics", async () => {
    mockGetTravelDocuments.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockLoadLogisticsCache.mockResolvedValue(CACHED)

    const { findByText, queryByLabelText, queryByText } = await render(<LogisticsScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("National park permit")

    expect(queryByLabelText("Add travel document")).toBeNull()
    expect(queryByLabelText("Delete National park permit")).toBeNull()
    expect(queryByText("Join")).toBeNull()
  })

  it("leaves the network error to the banner", async () => {
    mockGetTravelDocuments.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    const { findByText, queryByText } = await render(<LogisticsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("Logistics needs a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
  })
})
