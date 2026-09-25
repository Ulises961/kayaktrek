import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import MyDetailsScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/my-details"
import { getSession } from "../lib/auth/session"
import { enqueueMutation, pushQueuedMutations } from "../lib/db/mutation-queue"
import { loadOfflineCrew } from "../lib/db/offline-float-plan"
import { getTrip } from "../lib/trips/actions"

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
jest.mock("../lib/trips/actions", () => ({ getTrip: jest.fn() }))
jest.mock("../lib/auth/session", () => ({ getSession: jest.fn() }))
jest.mock("../lib/db/offline-float-plan", () => ({ loadOfflineCrew: jest.fn() }))
jest.mock("../lib/db/mutation-queue", () => ({
  ...jest.requireActual("../lib/db/mutation-queue"),
  enqueueMutation: jest.fn(),
  pushQueuedMutations: jest.fn(),
}))

const mockGetTrip = getTrip as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockLoadOfflineCrew = loadOfflineCrew as jest.Mock
const mockEnqueue = enqueueMutation as jest.Mock
const mockPush = pushQueuedMutations as jest.Mock

const ME = {
  id: "member-me",
  role: "crew",
  user: { id: "me-id", name: "Ana", surname: null, username: "ana" },
  vesselMake: "Valley",
  vesselModel: "Etain",
  vesselLengthCm: 530,
  emergencyContactName: "Jane",
  emergencyContactPhone: "+34600",
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ userId: "me-id" })
  mockGetTrip.mockResolvedValue({ id: "trip-1", travellers: [ME] })
  mockLoadOfflineCrew.mockResolvedValue([])
  mockEnqueue.mockResolvedValue("mutation-1")
  mockPush.mockResolvedValue({ applied: 1, rejected: 0, kept: 0 })
})

// M9d WP7: vessel and emergency contact, edited with or without signal.
describe("MyDetailsScreen", () => {
  it("starts from the paddler's current details", async () => {
    const { findByDisplayValue, getByDisplayValue } = await render(<MyDetailsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByDisplayValue("Valley")).toBeTruthy()
    expect(getByDisplayValue("530")).toBeTruthy()
    expect(getByDisplayValue("Jane")).toBeTruthy()
  })

  it("queues the changed details against the paddler's own crew row", async () => {
    const { findByTestId, getByTestId } = await render(<MyDetailsScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.changeText(await findByTestId("details-vesselMake"), "Prijon")
    await fireEvent.changeText(getByTestId("details-vesselLengthCm"), "540")
    await fireEvent.press(getByTestId("details-save"))

    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled())
    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "trip_member",
      operation: "update",
      entityId: "member-me",
      payload: expect.objectContaining({ tripId: "trip-1", vesselMake: "Prijon", vesselLengthCm: 540 }),
    })
    expect(mockPush).toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalled()
  })

  it("saves an emptied field as cleared", async () => {
    const { findByTestId, getByTestId } = await render(<MyDetailsScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.changeText(await findByTestId("details-emergencyContactPhone"), "")
    await fireEvent.press(getByTestId("details-save"))

    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled())
    expect(mockEnqueue.mock.calls[0][0].payload.emergencyContactPhone).toBeNull()
  })

  it("refuses a length that isn't a whole number of centimetres", async () => {
    const { findByTestId, getByTestId, findByText } = await render(<MyDetailsScreen />, {
      wrapper: WithCachedSurfaces,
    })

    await fireEvent.changeText(await findByTestId("details-vesselLengthCm"), "five metres")
    await fireEvent.press(getByTestId("details-save"))

    expect(await findByText("Length is in whole centimetres.")).toBeTruthy()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it("works offline from the synced crew", async () => {
    mockGetTrip.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockLoadOfflineCrew.mockResolvedValue([{ ...ME, vesselMake: "Cached make" }])

    const { findByDisplayValue } = await render(<MyDetailsScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByDisplayValue("Cached make")).toBeTruthy()
  })
})
