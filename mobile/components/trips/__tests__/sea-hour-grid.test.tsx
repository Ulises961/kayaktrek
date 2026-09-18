import { render } from "@testing-library/react-native";

import type { SeaState } from "@shared/dtos/sea";

import { SeaHourGrid } from "../sea-hour-grid";

// See weather-hour-grid.test.tsx's identical mock for why: BottomSheetScrollView
// avoids a real-device gesture conflict (a plain RN ScrollView nested in the
// sheet capped horizontal scrolling to the first ~5-6 items), and jest can't
// load the real @gorhom/bottom-sheet module (native Reanimated worklets).
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ScrollView } = require("react-native");
  return { __esModule: true, BottomSheetScrollView: ScrollView };
});

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

  it("shows swell height/period when present, a dash when not", async () => {
    const { getByText, getAllByText } = await render(
      <SeaHourGrid states={states} />,
    );

    expect(getByText("0.9 m")).toBeTruthy();
    expect(getByText("8 s")).toBeTruthy();
    // The 09:00 hour has no swell data — two dashes (height, period).
    expect(getAllByText("—")).toHaveLength(2);
  });
});
