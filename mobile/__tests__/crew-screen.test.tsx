import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"
import { OFFLINE_ERROR_MESSAGE } from "../lib/api/client"

import CrewScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/crew"
import { getSession } from "../lib/auth/session"
import { listConnections } from "../lib/connections/actions"
import { cancelInvitation, getTrip, inviteBuddy, removeMember } from "../lib/trips/actions"
import { loadOfflineCrew } from "../lib/db/offline-float-plan"
import { loadTripListCache } from "../lib/db/trip-list-cache"
import { isTripLeader } from "../lib/db/trip-role"

import { TRIP_STATE } from "@shared/dtos/trip"

// A plain stub, not requireActual — the real module's own Image usage collides
// with react-native-css's Image wrapper once this screen's Avatar is also in the
// module graph ("Cannot convert undefined or null to object" in
// copyComponentProperties.ts), a Jest-only double-registration this screen is the
// first to trigger. Every other screen test's requireActual-based mock still works
// because none of them import Avatar.
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "trip-1" }),
  useIsFocused: () => true,
}))
jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
  inviteBuddy: jest.fn(),
  cancelInvitation: jest.fn(),
  removeMember: jest.fn(),
}))
jest.mock("../lib/auth/session", () => ({
  getSession: jest.fn(),
}))
jest.mock("../lib/connections/actions", () => ({
  listConnections: jest.fn(),
}))
jest.mock("../lib/db/offline-float-plan", () => ({ loadOfflineCrew: jest.fn() }))
jest.mock("../lib/db/trip-role", () => ({ isTripLeader: jest.fn() }))
jest.mock("../lib/db/trip-list-cache", () => ({ loadTripListCache: jest.fn() }))
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetTrip = getTrip as jest.Mock
const mockGetSession = getSession as jest.Mock
const mockListConnections = listConnections as jest.Mock
const mockInviteBuddy = inviteBuddy as jest.Mock
const mockCancelInvitation = cancelInvitation as jest.Mock
const mockRemoveMember = removeMember as jest.Mock
const mockLoadOfflineCrew = loadOfflineCrew as jest.Mock

const LEADER = { id: "m-leader", role: "leader", user: { id: "leader-1", name: "Lea", surname: "Der" } }
const CREW = { id: "m-crew", role: "crew", user: { id: "crew-1", name: "Cara", surname: "Crew" } }

function tripWith(overrides: Partial<{ travellers: unknown[]; pendingTravellers: unknown[] }>) {
  return {
    id: "trip-1",
    destination: "Costa Brava",
    travellers: overrides.travellers ?? [LEADER, CREW],
    pendingTravellers: overrides.pendingTravellers ?? [],
  }
}

beforeEach(() => {
  mockGetTrip.mockReset()
  mockGetSession.mockReset()
  mockListConnections.mockReset()
  mockInviteBuddy.mockReset()
  mockCancelInvitation.mockReset()
  mockRemoveMember.mockReset()
  mockLoadOfflineCrew.mockReset().mockResolvedValue([])
  ;(isTripLeader as jest.Mock).mockReset().mockResolvedValue(false)
  ;(loadTripListCache as jest.Mock).mockReset().mockResolvedValue([])
})

// M9d WP5: the leader records who has left the water, signal or not.
describe("CrewScreen — departures", () => {
  it("lets the leader of a trip under way record a crew member leaving", async () => {
    ;(isTripLeader as jest.Mock).mockResolvedValue(true)
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue({ ...tripWith({}), state: TRIP_STATE.HAPPENING })

    const { findByTestId, queryByTestId } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("departure-open-m-crew")).toBeTruthy()
    // Never the leader's own row.
    expect(queryByTestId("departure-open-m-leader")).toBeNull()
  })

  it("offers it offline too, from the synced crew", async () => {
    ;(isTripLeader as jest.Mock).mockResolvedValue(true)
    mockGetTrip.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockLoadOfflineCrew.mockResolvedValue([
      { ...LEADER, user: { name: "Lea", surname: "Der", username: null }, leftAt: null, leftNote: null },
      { ...CREW, user: { name: "Cara", surname: "Crew", username: null }, leftAt: null, leftNote: null },
    ])
    ;(loadTripListCache as jest.Mock).mockResolvedValue([{ id: "trip-1", state: TRIP_STATE.HAPPENING }])

    const { findByTestId } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("departure-open-m-crew")).toBeTruthy()
  })

  it("shows a paddler who has left", async () => {
    mockGetSession.mockResolvedValue({ userId: "crew-1" })
    mockGetTrip.mockResolvedValue({
      ...tripWith({ travellers: [LEADER, { ...CREW, leftAt: "2026-10-02T09:30:00Z", leftNote: "Evacuated" }] }),
      state: TRIP_STATE.HAPPENING,
    })

    const { findByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText(/Left the trip/)).toBeTruthy()
    expect(await findByText("Evacuated")).toBeTruthy()
  })

  it("offers nothing on a trip that hasn't started", async () => {
    ;(isTripLeader as jest.Mock).mockResolvedValue(true)
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue({ ...tripWith({}), state: TRIP_STATE.BUILDING })

    const { findByText, queryByTestId } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Cara Crew")

    expect(queryByTestId("departure-open-m-crew")).toBeNull()
  })
})

describe("CrewScreen", () => {
  it("lists crew with role badges, without leader-only controls for a non-leader", async () => {
    mockGetSession.mockResolvedValue({ userId: "crew-1" })
    mockGetTrip.mockResolvedValue(tripWith({}))

    const { findByText, queryByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Lea Der")).toBeTruthy()
    expect(queryByText("Cara Crew")).toBeTruthy()
    expect(queryByText("Invite member")).toBeNull()
    expect(queryByText("Pending invitations")).toBeNull()
  })

  it("shows an empty panel, not a blank list, when there is no crew", async () => {
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue(tripWith({ travellers: [] }))

    const { findByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("No crew yet")).toBeTruthy()
  })

  it("lets the leader invite an accepted buddy and removes them from the picker on success", async () => {
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue(tripWith({}))
    mockListConnections.mockResolvedValue([
      { requester: { id: "leader-1" }, addressee: { id: "buddy-1", username: "ada", name: "Ada" } },
    ])
    mockInviteBuddy.mockResolvedValue(undefined)

    const { findByText, getByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Lea Der")

    fireEvent.press(getByText("Invite a buddy"))
    expect(await findByText("Ada")).toBeTruthy()

    fireEvent.press(getByText("Invite"))

    await waitFor(() => {
      expect(mockInviteBuddy).toHaveBeenCalledWith("trip-1", "buddy-1")
    })
    await waitFor(() => {
      expect(mockGetTrip).toHaveBeenCalledTimes(2)
    })
  })

  it("cancels a pending invitation and re-fetches the trip", async () => {
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue(
      tripWith({ pendingTravellers: [{ id: "pending-1", name: "Pat", surname: "Pending" }] }),
    )
    mockCancelInvitation.mockResolvedValue(undefined)

    const { findByText, getByLabelText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Pat Pending")

    fireEvent.press(getByLabelText(/cancel/i))

    await waitFor(() => {
      expect(mockCancelInvitation).toHaveBeenCalledWith("trip-1", "pending-1")
    })
  })

  it("lets the leader remove a crew member but not the leader", async () => {
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockResolvedValue(tripWith({}))
    mockRemoveMember.mockResolvedValue(undefined)

    const { findByText, getAllByLabelText, queryByLabelText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Cara Crew")

    // Only the non-leader row exposes a remove control.
    const removeButtons = getAllByLabelText(/remove/i)
    expect(removeButtons).toHaveLength(1)

    fireEvent.press(removeButtons[0])

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalledWith("trip-1", "crew-1")
    })
    expect(queryByLabelText(/remove.*lea der/i)).toBeNull()
  })

  it("surfaces a thrown error from the initial load", async () => {
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})

// Nothing synced for this trip yet: offline is still the expected state at
// sea, so the banner says what needs a connection instead of the screen
// printing the raw network error in red — and "No crew yet" would be false.
describe("CrewScreen — offline", () => {
  it("leaves the network error to the banner and claims no empty crew", async () => {
    mockGetTrip.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))

    const { findByText, queryByText } = await render(<CrewScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Crew needs a connection.")).toBeTruthy()
    expect(queryByText(OFFLINE_ERROR_MESSAGE)).toBeNull()
    expect(queryByText("No crew yet")).toBeNull()
  })
})

// The members are already on the device: every trip sync pulls trip_members,
// and the float plan reads them offline. This screen used to ignore them and
// show nothing at all without a connection.
describe("CrewScreen — cached crew", () => {
  const CACHED = [
    { id: "m-leader", role: "leader", user: { name: "Lea", surname: "Der", username: null } },
    { id: "m-crew", role: "crew", user: { name: "Cara", surname: "Crew", username: null } },
  ]

  it("falls back to the synced crew, with its age in the banner", async () => {
    mockGetTrip.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockLoadOfflineCrew.mockResolvedValue(CACHED)

    const { findByText, getByText, queryByText } = await render(<CrewScreen />, {
      wrapper: WithCachedSurfaces,
    })

    expect(await findByText("Lea Der")).toBeTruthy()
    expect(getByText("Cara Crew")).toBeTruthy()
    expect(getByText("Last synced 2 days ago.")).toBeTruthy()
    expect(queryByText("Crew needs a connection.")).toBeNull()
  })

  // Membership changes and invitations need the server, and pending invitations
  // are not cached — so the cached view is the list itself, read-only.
  it("offers no invite or remove while showing the cached crew", async () => {
    mockGetTrip.mockRejectedValue(new Error(OFFLINE_ERROR_MESSAGE))
    mockGetSession.mockResolvedValue({ userId: "leader-1" })
    mockLoadOfflineCrew.mockResolvedValue(CACHED)

    const { findByText, queryByText, queryByLabelText } = await render(<CrewScreen />, {
      wrapper: WithCachedSurfaces,
    })
    await findByText("Lea Der")

    expect(queryByText("Invite a buddy")).toBeNull()
    expect(queryByLabelText("Remove Cara Crew")).toBeNull()
  })
})
