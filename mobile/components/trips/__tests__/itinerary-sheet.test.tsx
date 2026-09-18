import { render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";

import { ItinerarySheet } from "../itinerary-sheet";

// @gorhom/bottom-sheet drives everything through native Reanimated worklets, which jest
// has no binding for (same class of failure jest.setup.ts already documents for
// expo-router/drawer's own reanimated pull-in). The screen's real behaviour under test is
// ItinerarySheet's own content and state, not gorhom's internals, so stub the primitive to
// just render its `handleComponent` and `children` inline — a persistently-docked sheet
// with no snapping is an adequate stand-in for asserting our layer's logic. The mock also
// surfaces the `index` prop via a testID, since that's the only way to observe whether
// ItinerarySheet asked to expand/collapse without a real native sheet to look at.
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View } = require("react-native");

  const MockBottomSheet = React.forwardRef(
    (
      {
        index,
        handleComponent: Handle,
        children,
      }: {
        index?: number;
        handleComponent?: () => React.ReactNode;
        children?: React.ReactNode;
      },
      _ref: unknown,
    ) => (
      <View>
        <Text testID="sheet-index">{index}</Text>
        {Handle ? <Handle /> : null}
        {children}
      </View>
    ),
  );
  MockBottomSheet.displayName = "MockBottomSheet";

  return {
    __esModule: true,
    default: MockBottomSheet,
    BottomSheetView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
    }) => <View {...props}>{children}</View>,
  };
});

const DAY_ID = "01998e2a-0000-7000-8000-000000000001";

const dayWithConditions: Day = {
  id: DAY_ID,
  dayNumber: 1,
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

const dayWithoutConditions: Day = { id: "day-2", dayNumber: 2 };

// M9l WP2 (revised): day selection/toggle now lives in the parent screen (via
// `DayRail`, a separate top bar) — ItinerarySheet is purely a controlled weather/sea
// panel. See day-rail.test.tsx for the day-strip's own tests.
describe("ItinerarySheet", () => {
  it("collapses when the caller asks it to, even if the day has conditions", async () => {
    const { getByTestId } = await render(
      <ItinerarySheet
        selectedDay={dayWithConditions}
        expanded={false}
        onExpandedChange={jest.fn()}
      />,
    );

    expect(getByTestId("sheet-index").props.children).toBe(0);
  });

  it("expands when the caller asks it to and the day has conditions", async () => {
    const { getByTestId, getByText } = await render(
      <ItinerarySheet
        selectedDay={dayWithConditions}
        expanded={true}
        onExpandedChange={jest.fn()}
      />,
    );

    expect(getByTestId("sheet-index").props.children).toBe(1);
    // WeatherSeaPanel's own body content (the "HH:MM · temp" row) — proves the sheet
    // body actually renders it, not just asking for index 1.
    expect(getByText(/12:00 · 18°C/)).toBeTruthy();
  });

  it("stays collapsed when asked to expand a day with no weather or sea data", async () => {
    const { getByTestId } = await render(
      <ItinerarySheet
        selectedDay={dayWithoutConditions}
        expanded={true}
        onExpandedChange={jest.fn()}
      />,
    );

    expect(getByTestId("sheet-index").props.children).toBe(0);
  });

  it("stays collapsed with no selected day at all", async () => {
    const { getByTestId } = await render(
      <ItinerarySheet
        selectedDay={null}
        expanded={true}
        onExpandedChange={jest.fn()}
      />,
    );

    expect(getByTestId("sheet-index").props.children).toBe(0);
  });
});
