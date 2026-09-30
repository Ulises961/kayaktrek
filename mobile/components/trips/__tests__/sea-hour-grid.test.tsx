import { fireEvent, render } from "@testing-library/react-native";

import type { SeaState } from "@shared/dtos/sea";

import { SeaHourGrid } from "../sea-hour-grid";

const states: SeaState[] = [
  {
    dayId: "day-1",
    time: "09:00:00",
    waveHeight: 0.4,
    waveDirection: 200,
  },
  {
    dayId: "day-1",
    time: "12:00:00",
    waveHeight: 1.8,
    waveDirection: 210,
    swellWaveHeight: 0.9,
    swellDirection: 220,
    swellPeriod: 8,
  },
];

// M9l WP4: adapts web's SeaGrid (frontend/components/weather/sea-grid.tsx)
// content onto a horizontal ScrollView, same "adapt the mechanism, replicate
// the content" pattern as WeatherHourGrid.
describe("SeaHourGrid", () => {
  it("renders nothing when there are no hourly states", async () => {
    const { toJSON } = await render(<SeaHourGrid states={[]} />);
    expect(toJSON()).toBeNull();
  });

  it("shows a card per hour with wave height", async () => {
    const { getByText } = await render(<SeaHourGrid states={states} />);

    expect(getByText("09:00")).toBeTruthy();
    expect(getByText("0.4 m")).toBeTruthy();
    expect(getByText("12:00")).toBeTruthy();
    expect(getByText("1.8 m")).toBeTruthy();
  });

  it("shows a dash, not a number, for an hour with no wave data when other hours have it", async () => {
    const { getByText, getAllByText, queryByText } = await render(
      <SeaHourGrid
        states={[
          { dayId: "day-1", time: "09:00:00", waveHeight: null, waveDirection: null },
          { dayId: "day-1", time: "12:00:00", waveHeight: 0.4, waveDirection: 200 },
        ]}
      />,
    );

    expect(getByText("09:00")).toBeTruthy();
    expect(getByText("0.4 m")).toBeTruthy();
    expect(queryByText(/no wave forecast/i)).toBeNull();
    // 09:00 is missing wave height, swell height and swell period; 12:00 has no swell.
    expect(getAllByText("—")).toHaveLength(5);
  });

  it("says there is no wave forecast, instead of a row of dashes, when no hour has any", async () => {
    const { getByText, queryByText, queryAllByText } = await render(
      <SeaHourGrid
        states={[
          { dayId: "day-1", time: "09:00:00", waveHeight: null, waveDirection: null },
          { dayId: "day-1", time: "12:00:00", waveHeight: null, waveDirection: null },
        ]}
      />,
    );

    expect(getByText(/Sea & swell/)).toBeTruthy();
    expect(getByText(/no wave forecast for this area/i)).toBeTruthy();
    expect(queryByText("09:00")).toBeNull();
    expect(queryAllByText("—")).toHaveLength(0);
  });

  it("shows swell height/period when present, a dash when not", async () => {
    const { getByText, getAllByText } = await render(
      <SeaHourGrid states={states} />,
    );

    expect(getByText("0.9 m")).toBeTruthy();
    expect(getByText("8 s")).toBeTruthy();
    // The 09:00 hour has no swell data — two dashes (height, period).
    expect(getAllByText("—")).toHaveLength(2);
  });

  // M35 WP3: same contract as WeatherHourGrid and web's SeaGrid.
  describe("hour selection", () => {
    it("reports the tapped hour as a number of hours into the day", async () => {
      const onHourChange = jest.fn();
      const { getByLabelText } = await render(
        <SeaHourGrid states={states} onHourChange={onHourChange} />,
      );

      await fireEvent.press(getByLabelText("Show 12:00 on the map"));

      expect(onHourChange).toHaveBeenCalledTimes(1);
      expect(onHourChange).toHaveBeenCalledWith(12);
    });

    it("marks only the selected hour as selected", async () => {
      const { getByLabelText } = await render(
        <SeaHourGrid states={states} selectedHour={12} onHourChange={jest.fn()} />,
      );

      expect(getByLabelText("Show 12:00 on the map").props.accessibilityState)
        .toMatchObject({ selected: true });
      expect(getByLabelText("Show 09:00 on the map").props.accessibilityState)
        .toMatchObject({ selected: false });
    });

    it("is not tappable when nothing is listening for the hour", async () => {
      const { queryByLabelText } = await render(<SeaHourGrid states={states} />);

      expect(queryByLabelText("Show 12:00 on the map")).toBeNull();
    });
  });
});
