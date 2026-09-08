import { fireEvent, render } from "@testing-library/react-native"

import type { Day } from "@shared/dtos/day"

import { ItinerarySheet } from "../itinerary-sheet"

// @gorhom/bottom-sheet drives everything through native Reanimated worklets, which jest
// has no binding for (same class of failure jest.setup.ts already documents for
// expo-router/drawer's own reanimated pull-in). The screen's real behaviour under test is
// ItinerarySheet's own content and state, not gorhom's internals, so stub the primitive to
// just render its `handleComponent` and `children` inline — a persistently-docked sheet
// with no snapping is an adequate stand-in for asserting our layer's logic.
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native")

  const MockBottomSheet = React.forwardRef(
    (
      { handleComponent: Handle, children }: { handleComponent?: () => React.ReactNode; children?: React.ReactNode },
      _ref: unknown,
    ) => (
      <View>
        {Handle ? <Handle /> : null}
        {children}
      </View>
    ),
  )
  MockBottomSheet.displayName = "MockBottomSheet"

  return {
    __esModule: true,
    default: MockBottomSheet,
    BottomSheetView: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View {...props}>{children}</View>
    ),
  }
})

const days: Day[] = [
  { id: "day-1", dayNumber: 1 },
  { id: "day-2", dayNumber: 2 },
]

const DAY_ID = "01998e2a-0000-7000-8000-000000000001"

const dayWithConditions: Day = {
  id: DAY_ID,
  dayNumber: 1,
  weather: {
    dayId: DAY_ID,
    weatherStates: [
      { dayId: DAY_ID, time: "12:00:00", temperature: 18, windForce: 12, windDirection: 270, precipitation: 0 },
    ],
  },
  sea: {
    dayId: DAY_ID,
    seaStates: [{ dayId: DAY_ID, time: "12:00:00", waveHeight: 0.8, waveDirection: 210 }],
  },
}

describe("ItinerarySheet", () => {
  it("renders a chip per day and selects one on press", async () => {
    const onSelectDay = jest.fn()
    const { getByText } = await render(
      <ItinerarySheet days={days} selectedDayId="day-1" onSelectDay={onSelectDay} selectedDay={null} />,
    )

    await fireEvent.press(getByText("Day 2"))

    expect(onSelectDay).toHaveBeenCalledWith("day-2")
  })

  it("shows no expand toggle when the selected day has no weather or sea data", async () => {
    const { queryByLabelText } = await render(
      <ItinerarySheet days={days} selectedDayId="day-1" onSelectDay={jest.fn()} selectedDay={days[0]} />,
    )

    expect(queryByLabelText(/weather and sea detail/i)).toBeNull()
  })

  it("shows an expand toggle and the weather body when the day has conditions", async () => {
    const { getByLabelText, getByText } = await render(
      <ItinerarySheet
        days={days}
        selectedDayId="day-1"
        onSelectDay={jest.fn()}
        selectedDay={dayWithConditions}
      />,
    )

    expect(getByLabelText("Show weather and sea detail")).toBeTruthy()
    // WeatherSeaPanel's own body content (the "HH:MM · temp" row) — proves the sheet
    // body actually renders it, not just the handle's condensed teaser.
    expect(getByText(/12:00 · 18°C/)).toBeTruthy()
  })

  it("flips the toggle's accessibility label after being pressed", async () => {
    const { getByLabelText } = await render(
      <ItinerarySheet
        days={days}
        selectedDayId="day-1"
        onSelectDay={jest.fn()}
        selectedDay={dayWithConditions}
      />,
    )

    await fireEvent.press(getByLabelText("Show weather and sea detail"))

    expect(getByLabelText("Hide weather and sea detail")).toBeTruthy()
  })
})
