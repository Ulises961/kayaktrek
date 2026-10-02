import { fireEvent, render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";

import type { VelocityField } from "@mobile/lib/weather/velocity";
import { useVelocityField } from "@mobile/lib/weather/use-velocity-field";

import { MapVelocityOverlay } from "../map-velocity-overlay";

jest.mock("@mobile/lib/weather/use-velocity-field", () => ({
  useVelocityField: jest.fn(),
}));

// The Skia overlay is covered by its own test; here it is a marker that records the
// colour it was asked to draw in.
jest.mock("../velocity-overlay", () => ({
  VelocityOverlay: (props: { color: string }) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "velocity-overlay", accessibilityLabel: props.color });
  },
}));

const mockUseVelocityField = useVelocityField as jest.Mock;

const DAY_ID = "01998e2a-0000-7000-8000-000000000001";

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const day: Day = {
  id: DAY_ID,
  dayNumber: 1,
  weather: {
    dayId: DAY_ID,
    weatherStates: [{ dayId: DAY_ID, time: "12:00:00", temperature: 18 }],
    fetchedAt: isoMinutesAgo(120),
  },
};

const field: VelocityField = {
  north: 54.3,
  south: 53.9,
  west: -4.7,
  east: -4.3,
  nx: 2,
  ny: 2,
  u: [4, 4, 4, 4],
  v: [0, 0, 0, 0],
};

const baseProps = {
  day,
  kind: null,
  onKindChange: jest.fn(),
  hour: 12,
  viewRef: { current: null },
  size: { width: 400, height: 800 },
  offline: false,
} as const;

beforeEach(() => {
  mockUseVelocityField.mockReset();
  mockUseVelocityField.mockReturnValue({ status: "idle", field: null, error: null });
  baseProps.onKindChange.mockReset();
});

describe("MapVelocityOverlay", () => {
  it("offers wind and swell, both off to begin with", async () => {
    const { getByLabelText } = await render(<MapVelocityOverlay {...baseProps} />);

    expect(getByLabelText("Show wind on the map").props.accessibilityState).toMatchObject({ selected: false });
    expect(getByLabelText("Show swell on the map").props.accessibilityState).toMatchObject({ selected: false });
  });

  it("does not fetch anything while both are off", async () => {
    await render(<MapVelocityOverlay {...baseProps} />);

    expect(mockUseVelocityField).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("turns wind on when its chip is pressed, and off again when it is pressed a second time", async () => {
    const { getByLabelText, rerender } = await render(<MapVelocityOverlay {...baseProps} />);

    await fireEvent.press(getByLabelText("Show wind on the map"));
    expect(baseProps.onKindChange).toHaveBeenLastCalledWith("wind");

    await rerender(<MapVelocityOverlay {...baseProps} kind="wind" />);
    expect(getByLabelText("Show wind on the map").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(getByLabelText("Show wind on the map"));
    expect(baseProps.onKindChange).toHaveBeenLastCalledWith(null);
  });

  it("asks for the selected day's field at the chosen hour", async () => {
    mockUseVelocityField.mockReturnValue({ status: "loading", field: null, error: null });

    await render(<MapVelocityOverlay {...baseProps} kind="wave" hour={15} />);

    expect(mockUseVelocityField).toHaveBeenLastCalledWith({
      dayId: DAY_ID,
      hour: 15,
      kind: "wave",
      enabled: true,
    });
  });

  it("draws the field once it has loaded, and says when the forecast is from", async () => {
    mockUseVelocityField.mockReturnValue({ status: "ready", field, error: null });

    const { getByTestId, getByText } = await render(<MapVelocityOverlay {...baseProps} kind="wind" />);

    expect(getByTestId("velocity-overlay")).toBeTruthy();
    expect(getByText(/Wind · 12:00 · forecast as of 2 hours ago/)).toBeTruthy();
  });

  it("tells the paddler the flow is one reading for the whole area, not a spatial map", async () => {
    mockUseVelocityField.mockReturnValue({ status: "ready", field, error: null });

    const { getByText } = await render(<MapVelocityOverlay {...baseProps} kind="wind" />);

    expect(getByText(/same across the whole area/i)).toBeTruthy();
  });

  it("colours swell differently from wind", async () => {
    mockUseVelocityField.mockReturnValue({ status: "ready", field, error: null });

    const wind = await render(<MapVelocityOverlay {...baseProps} kind="wind" />);
    const windColour = wind.getByTestId("velocity-overlay").props.accessibilityLabel;
    await wind.unmount();

    const swell = await render(<MapVelocityOverlay {...baseProps} kind="wave" />);
    const swellColour = swell.getByTestId("velocity-overlay").props.accessibilityLabel;

    expect(swellColour).not.toBe(windColour);
  });

  it("says it is loading, and draws nothing yet", async () => {
    mockUseVelocityField.mockReturnValue({ status: "loading", field: null, error: null });

    const { getByText, queryByTestId } = await render(<MapVelocityOverlay {...baseProps} kind="wind" />);

    expect(getByText(/Loading wind/)).toBeTruthy();
    expect(queryByTestId("velocity-overlay")).toBeNull();
  });

  it("says when the day has no forecast for the chosen layer", async () => {
    mockUseVelocityField.mockReturnValue({ status: "empty", field: null, error: null });

    const { getByText, queryByTestId } = await render(<MapVelocityOverlay {...baseProps} kind="wave" />);

    expect(getByText(/No swell forecast for this day/)).toBeTruthy();
    expect(queryByTestId("velocity-overlay")).toBeNull();
  });

  it("shows the failure rather than a stale field", async () => {
    mockUseVelocityField.mockReturnValue({ status: "error", field: null, error: "Could not reach the server." });

    const { getByText, queryByTestId } = await render(<MapVelocityOverlay {...baseProps} kind="wind" />);

    expect(getByText("Could not reach the server.")).toBeTruthy();
    expect(queryByTestId("velocity-overlay")).toBeNull();
  });

  it("is switched off, with the reason, when the phone is offline", async () => {
    const { getByLabelText, getByText } = await render(<MapVelocityOverlay {...baseProps} offline />);

    expect(getByLabelText("Show wind on the map").props.accessibilityState).toMatchObject({ disabled: true });
    expect(getByText(/needs a connection/i)).toBeTruthy();
    expect(mockUseVelocityField).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("does not fetch while offline even if a layer was left on", async () => {
    await render(<MapVelocityOverlay {...baseProps} kind="wind" offline />);

    expect(mockUseVelocityField).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("is switched off until a day is selected", async () => {
    const { getByLabelText, getByText } = await render(<MapVelocityOverlay {...baseProps} day={null} />);

    expect(getByLabelText("Show wind on the map").props.accessibilityState).toMatchObject({ disabled: true });
    expect(getByText(/Select a day/)).toBeTruthy();
  });
});
