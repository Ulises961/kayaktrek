import { render } from "@testing-library/react-native";

import type { WeatherState } from "@shared/dtos/weather";

import { WeatherHourGrid } from "../weather-hour-grid";

const states: WeatherState[] = [
  {
    dayId: "day-1",
    time: "09:00:00",
    temperature: 18,
    windForce: 12,
    windDirection: 270,
    precipitation: 0,
    cloud: "20",
  },
  {
    dayId: "day-1",
    time: "12:00:00",
    temperature: 22,
    windForce: 30,
    windDirection: 90,
    precipitation: 2.4,
    cloud: "80",
  },
];

// M9l WP4: adapts web's weather-grid.tsx content (time, rotated wind-direction
// arrow, Beaufort-severity coloring, temperature, precipitation) onto a
// ScrollView instead of embla-carousel-react, which has no RN equivalent.
describe("WeatherHourGrid", () => {
  it("renders nothing when there are no hourly states", async () => {
    const { toJSON } = await render(<WeatherHourGrid states={[]} />);
    expect(toJSON()).toBeNull();
  });

  it("shows a card per hour with time and temperature", async () => {
    const { getByText } = await render(<WeatherHourGrid states={states} />);

    expect(getByText("09:00")).toBeTruthy();
    expect(getByText("18°")).toBeTruthy();
    expect(getByText("12:00")).toBeTruthy();
    expect(getByText("22°")).toBeTruthy();
  });

  it("shows the Beaufort force in knots per hour", async () => {
    const { getByText } = await render(<WeatherHourGrid states={states} />);

    expect(getByText("12 kn")).toBeTruthy();
    expect(getByText("30 kn")).toBeTruthy();
  });

  it("shows precipitation only when it's above zero", async () => {
    const { getByText, queryByText } = await render(
      <WeatherHourGrid states={states} />,
    );

    expect(getByText("2.4")).toBeTruthy();
    // The 09:00 hour has 0 precipitation — only one "0.0"-style value should
    // ever render, and it shouldn't be for a zero reading.
    expect(queryByText("0.0")).toBeNull();
  });

  it("shows a dash for an hour with no wind reading", async () => {
    const noWind: WeatherState[] = [
      { dayId: "day-1", time: "06:00:00", temperature: 15, windForce: null },
    ];
    const { getByText } = await render(<WeatherHourGrid states={noWind} />);

    expect(getByText("—")).toBeTruthy();
  });
});
