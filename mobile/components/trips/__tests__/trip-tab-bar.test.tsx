import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import { TRIP_STATE, type TripState } from "@shared/dtos/trip"

import { startTrip } from "../../../lib/trips/actions"
import { TripHeaderEditProvider, usePublishTripEdit } from "../../../lib/trips/trip-header-edit"
import { useTripHeader, type TripHeaderView } from "../../../lib/trips/use-trip-header"
import { TripTabBar } from "../trip-tab-bar"

jest.mock("../../../lib/trips/use-trip-header", () => ({ useTripHeader: jest.fn() }))
jest.mock("../../../lib/trips/actions", () => ({ startTrip: jest.fn() }))
const mockStartTrip = startTrip as jest.Mock
const mockRouterBack = jest.fn()
const mockRouterReplace = jest.fn()
const mockCanGoBack = jest.fn()
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace, canGoBack: mockCanGoBack }),
}))

const mockUseTripHeader = useTripHeader as jest.Mock

function tripIn(state: TripState): TripHeaderView {
  return {
    destination: "Costa Brava",
    state,
    dateFrom: "2026-06-10",
    dateTo: "2026-06-16",
    difficulty: "moderate",
    isPaused: false,
    pausedAt: null,
  }
}

function loaded(trip: TripHeaderView | null, isLeader = false) {
  mockUseTripHeader.mockReturnValue({
    trip,
    isLeader,
    error: null,
    isOffline: false,
    cachedAt: null,
    reload: jest.fn(),
  })
}

const ROUTES = ["index", "crew", "float-plan", "logistics", "items", "live"].map((name) => ({
  key: `${name}-key`,
  name,
}))

function renderBar(focused: string, navigate = jest.fn()) {
  return render(
    <TripTabBar
      tripId="trip-1"
      state={{ routes: ROUTES, index: ROUTES.findIndex((route) => route.name === focused) }}
      navigation={{ navigate }}
    />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCanGoBack.mockReturnValue(true)
})

describe("TripTabBar", () => {
  it("lists the trip's sections in web's order", async () => {
    loaded(tripIn(TRIP_STATE.BUILDING))

    const { getAllByRole } = await renderBar("index")

    expect(getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual([
      "Itinerary",
      "Crew",
      "Float plan",
      "Logistics",
      "Items",
    ])
  })

  it("puts Live first while the trip is under way", async () => {
    loaded(tripIn(TRIP_STATE.HAPPENING))

    const { getAllByRole } = await renderBar("index")

    expect(getAllByRole("tab")[0].props.accessibilityLabel).toBe("Live")
  })

  it.each([TRIP_STATE.BUILDING, TRIP_STATE.PAST])("has no Live tab on a %s trip", async (state) => {
    loaded(tripIn(state))

    const { queryByLabelText } = await renderBar("index")

    expect(queryByLabelText("Live")).toBeNull()
  })

  it("marks the focused section as selected", async () => {
    loaded(tripIn(TRIP_STATE.BUILDING))

    const { getByLabelText } = await renderBar("crew")

    expect(getByLabelText("Crew").props.accessibilityState).toMatchObject({ selected: true })
    expect(getByLabelText("Items").props.accessibilityState).toMatchObject({ selected: false })
  })

  it("moves to a section when its tab is pressed", async () => {
    loaded(tripIn(TRIP_STATE.BUILDING))
    const navigate = jest.fn()
    const { getByLabelText } = await renderBar("index", navigate)

    await fireEvent.press(getByLabelText("Logistics"))

    expect(navigate).toHaveBeenCalledWith("logistics")
  })

  it("shows the whole header on a section that scrolls", async () => {
    loaded(tripIn(TRIP_STATE.BUILDING))

    const { getByText } = await renderBar("crew")

    expect(getByText(DIFFICULTY_LABELS.moderate)).toBeTruthy()
  })

  // The itinerary hands the rest of the height to its map (decision 2, M43).
  it("collapses the header to its title row on the itinerary", async () => {
    loaded(tripIn(TRIP_STATE.BUILDING))

    const { getByText, queryByText } = await renderBar("index")

    expect(getByText("Costa Brava")).toBeTruthy()
    expect(queryByText(DIFFICULTY_LABELS.moderate)).toBeNull()
  })

  it("still shows the sections before the trip has loaded", async () => {
    loaded(null)

    const { getByLabelText, queryByTestId } = await renderBar("index")

    expect(getByLabelText("Crew")).toBeTruthy()
    expect(queryByTestId("trip-actions")).toBeNull()
  })

  describe("the itinerary's edit button", () => {
    function Publisher({ canEdit, onToggle }: { canEdit: boolean; onToggle: () => void }) {
      usePublishTripEdit({ canEdit, editing: false, onToggle })
      return null
    }

    function renderWithPublisher(canEdit: boolean, onToggle = jest.fn()) {
      return render(
        <TripHeaderEditProvider>
          <Publisher canEdit={canEdit} onToggle={onToggle} />
          <TripTabBar
            tripId="trip-1"
            state={{ routes: ROUTES, index: 0 }}
            navigation={{ navigate: jest.fn() }}
          />
        </TripHeaderEditProvider>,
      )
    }

    it("sits in the header while the itinerary says the paddler can edit, and works", async () => {
      loaded(tripIn(TRIP_STATE.BUILDING), true)
      const onToggle = jest.fn()
      const { getByTestId } = await renderWithPublisher(true, onToggle)

      await fireEvent.press(getByTestId("edit-mode-toggle"))

      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it("is absent when the paddler cannot edit", async () => {
      loaded(tripIn(TRIP_STATE.BUILDING), false)

      const { queryByTestId } = await renderWithPublisher(false)

      expect(queryByTestId("edit-mode-toggle")).toBeNull()
    })
  })

  describe("the ••• actions", () => {
    it("opens the sheet for the leader of a planned trip", async () => {
      loaded(tripIn(TRIP_STATE.BUILDING), true)
      const { getByTestId } = await renderBar("crew")

      await fireEvent.press(getByTestId("trip-actions"))

      expect(getByTestId("trip-start")).toBeTruthy()
    })

    it("is not offered to crew", async () => {
      loaded(tripIn(TRIP_STATE.BUILDING), false)

      const { queryByTestId } = await renderBar("crew")

      expect(queryByTestId("trip-actions")).toBeNull()
    })

    it("is not offered for a finished trip", async () => {
      loaded(tripIn(TRIP_STATE.PAST), true)

      const { queryByTestId } = await renderBar("crew")

      expect(queryByTestId("trip-actions")).toBeNull()
    })

    it("reloads the header once the trip has been started from the sheet", async () => {
      const reload = jest.fn()
      mockUseTripHeader.mockReturnValue({
        trip: tripIn(TRIP_STATE.BUILDING),
        isLeader: true,
        error: null,
        isOffline: false,
        cachedAt: null,
        reload,
      })
      mockStartTrip.mockResolvedValue(undefined)
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      const { getByTestId, queryByTestId } = await renderBar("crew")
      await fireEvent.press(getByTestId("trip-actions"))

      await fireEvent.press(getByTestId("trip-start"))
      const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[]
      await act(async () => {
        buttons.find((button) => button.text === "Start")?.onPress?.()
      })

      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
      expect(mockStartTrip).toHaveBeenCalledWith("trip-1")
      expect(queryByTestId("trip-start")).toBeNull()
    })
  })

  describe("back", () => {
    it("returns to where the trip was opened from", async () => {
      loaded(tripIn(TRIP_STATE.BUILDING))
      const { getByTestId } = await renderBar("crew")

      await fireEvent.press(getByTestId("trip-back"))

      expect(mockRouterBack).toHaveBeenCalledTimes(1)
      expect(mockRouterReplace).not.toHaveBeenCalled()
    })

    it("goes to the trip list when the trip was opened with nothing behind it", async () => {
      mockCanGoBack.mockReturnValue(false)
      loaded(tripIn(TRIP_STATE.BUILDING))
      const { getByTestId } = await renderBar("crew")

      await fireEvent.press(getByTestId("trip-back"))

      expect(mockRouterReplace).toHaveBeenCalledWith("/")
      expect(mockRouterBack).not.toHaveBeenCalled()
    })
  })
})
