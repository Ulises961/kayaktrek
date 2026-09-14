import { fireEvent, render, waitFor } from "@testing-library/react-native"

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

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
  }
})
jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
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
})

describe("LogisticsScreen", () => {
  it("shows empty panels for both sections when there is nothing yet", async () => {
    mockGetTravelDocuments.mockResolvedValue([])
    mockGetShuttleVehicles.mockResolvedValue([])

    const { findByText } = await render(<LogisticsScreen />)

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

    const { findByText } = await render(<LogisticsScreen />)

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
    )
    await findByText("No travel documents yet")

    fireEvent.press(getByLabelText("Add travel document"))
    const nameInput = await findByPlaceholderText("Name (e.g. Ferry booking)")
    fireEvent.changeText(nameInput, "Hostel booking")
    await waitFor(() => expect(nameInput.props.value).toBe("Hostel booking"))
    fireEvent.press(getByText("Add document"))

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

    const { findByText } = await render(<LogisticsScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})
