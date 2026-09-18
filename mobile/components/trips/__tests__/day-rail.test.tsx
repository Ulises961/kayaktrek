import { fireEvent, render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";
import { getDayColor } from "@shared/itinerary/colors";

import { DayRail } from "../day-rail";

const days: Day[] = [
  { id: "day-1", dayNumber: 1 },
  { id: "day-2", dayNumber: 2 },
];

const DAY_ID = "01998e2a-0000-7000-8000-000000000001";

const dayWithConditions: Day = {
  id: DAY_ID,
  dayNumber: 1,
  date: "2026-07-14",
  weather: {
    dayId: DAY_ID,
    weatherStates: [
      {
        dayId: DAY_ID,
        time: "12:00:00",
        temperature: 18,
        windForce: 12,
        windDirection: 270,
        precipitation: 0,
      },
    ],
  },
  sea: {
    dayId: DAY_ID,
    seaStates: [
      { dayId: DAY_ID, time: "12:00:00", waveHeight: 0.8, waveDirection: 210 },
    ],
  },
};

const daysWithConditions: Day[] = [dayWithConditions, days[1]];

// M9l WP2 (revised): the day carousel is its own top bar — separate from
// ItinerarySheet's weather/sea bottom sheet, matching web's actual layout
// (frontend/components/map/day-rail.tsx sits above the map, not inside the
// bottom FeatureDrawer). Correction to WP2's first pass, which had restyled
// the cards but kept them inside the sheet's handle.
describe("DayRail", () => {
  it("renders a card per day and calls onDayPress on tap", async () => {
    const onDayPress = jest.fn();
    const { getByText } = await render(
      <DayRail days={days} selectedDayId="day-1" onDayPress={onDayPress} />,
    );

    await fireEvent.press(getByText("Day 2"));

    expect(onDayPress).toHaveBeenCalledWith("day-2");
  });

  it("colors each day's swatch with getDayColor, keyed by dayNumber not array index", async () => {
    const { getByTestId } = await render(
      <DayRail days={days} selectedDayId="day-1" onDayPress={jest.fn()} />,
    );

    expect(getByTestId("day-swatch-day-1").props.style).toMatchObject({
      backgroundColor: getDayColor(1),
    });
    expect(getByTestId("day-swatch-day-2").props.style).toMatchObject({
      backgroundColor: getDayColor(2),
    });
  });

  it("shows the day's date when it has one", async () => {
    const { getByText } = await render(
      <DayRail
        days={daysWithConditions}
        selectedDayId={DAY_ID}
        onDayPress={jest.fn()}
      />,
    );

    expect(getByText("14 Jul 2026")).toBeTruthy();
  });

  it("shows a conditions teaser when the day has weather or sea data", async () => {
    const { getByText } = await render(
      <DayRail
        days={daysWithConditions}
        selectedDayId={DAY_ID}
        onDayPress={jest.fn()}
      />,
    );

    expect(getByText("18°C · 12 kn · 0.8 m")).toBeTruthy();
  });

  it("shows no point count on the day card", async () => {
    const { queryByText } = await render(
      <DayRail days={days} selectedDayId="day-1" onDayPress={jest.fn()} />,
    );

    expect(queryByText(/point/i)).toBeNull();
  });

  it("renders nothing when there are no days", async () => {
    const { queryByText, toJSON } = await render(
      <DayRail days={[]} selectedDayId={null} onDayPress={jest.fn()} />,
    );

    expect(queryByText(/Day/)).toBeNull();
    expect(toJSON()).toBeNull();
  });
});
