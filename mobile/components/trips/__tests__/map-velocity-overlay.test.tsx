import { fireEvent, render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";
import { discCell } from "@shared/landing/ambient-wind";
import { formatTimeAgo } from "@shared/utils/date";

import { WIND_SPEED_COLORS, windLegendLabels, windSpeedColor } from "@shared/weather/wind-scale";

import type { VelocityField } from "@mobile/lib/weather/velocity";
import { meanSpeed } from "@mobile/lib/weather/velocity-frame";
import { useVelocityField } from "@mobile/lib/weather/use-velocity-field";

import { MapVelocityOverlay, WIND_PARTICLE_MULTIPLIER, WIND_STROKE_WIDTH } from "../map-velocity-overlay";

jest.mock("@mobile/lib/weather/use-velocity-field", () => ({
  useVelocityField: jest.fn(),
}));

// The three Skia components are covered by their own tests. Here each is a marker that records
// the props it was given, so what is under test is what the container decides: which of them
// to draw, for which field, and with what.
const mockProps: {
  wind?: Record<string, unknown>
  swell?: Record<string, unknown>
  ring?: Record<string, unknown>
} = {};
jest.mock("../velocity-overlay", () => ({
  VelocityOverlay: (props: Record<string, unknown>) => {
    const { createElement } = jest.requireActual("react");
    mockProps.wind = props;
    return createElement("View", { testID: "wind-overlay" });
  },
}));
jest.mock("../swell-overlay", () => ({
  SwellOverlay: (props: Record<string, unknown>) => {
    const { createElement } = jest.requireActual("react");
    mockProps.swell = props;
    return createElement("View", { testID: "swell-overlay" });
  },
}));
jest.mock("../forecast-ring", () => ({
  ForecastRing: (props: Record<string, unknown>) => {
    const { createElement } = jest.requireActual("react");
    mockProps.ring = props;
    return createElement("View", { testID: "forecast-ring" });
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

// A day's route: two points a few km apart.
const dayPositions: [number, number][] = [
  [54.1, -4.5],
  [54.12, -4.48],
];

// 5x5 cells over about a degree, blowing east at 4 m/s everywhere — much bigger than the
// forecast disc around the route, so clipping to the disc has something to remove.
const field: VelocityField = {
  north: 54.6,
  south: 53.6,
  west: -5.0,
  east: -4.0,
  nx: 5,
  ny: 5,
  u: new Array(25).fill(4),
  v: new Array(25).fill(0),
};

type HookState = { status: string; field: VelocityField | null; error: string | null };
const idle: HookState = { status: "idle", field: null, error: null };
const ready: HookState = { status: "ready", field, error: null };

function hooks(wind: HookState, wave: HookState) {
  mockUseVelocityField.mockImplementation(({ kind }: { kind: string }) => (kind === "wind" ? wind : wave));
}

const handlers = { onWindToggle: jest.fn(), onSwellToggle: jest.fn() };

const baseProps = {
  day,
  dayPositions,
  windOn: false,
  swellOn: false,
  ...handlers,
  hour: 12,
  viewRef: { current: null },
  size: { width: 400, height: 800 },
  offline: false,
} as const;

beforeEach(() => {
  mockUseVelocityField.mockReset();
  hooks(idle, idle);
  handlers.onWindToggle.mockReset();
  handlers.onSwellToggle.mockReset();
  delete mockProps.wind;
  delete mockProps.swell;
  delete mockProps.ring;
});

async function openPanel(utils: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(utils.getByLabelText("Map overlays"));
}

describe("MapVelocityOverlay: the layers control", () => {
  it("is a single button until it is opened, with nothing else on the map", async () => {
    const { getByLabelText, queryByLabelText, queryByText } = await render(<MapVelocityOverlay {...baseProps} />);

    expect(getByLabelText("Map overlays")).toBeTruthy();
    expect(queryByLabelText("Wind")).toBeNull();
    expect(queryByLabelText("Swell")).toBeNull();
    expect(queryByText(/forecast as of/i)).toBeNull();
  });

  it("opens to a panel with a switch for wind and one for swell, both off", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} />);

    await openPanel(utils);

    expect(utils.getByLabelText("Wind").props.accessibilityRole).toBe("switch");
    expect(utils.getByLabelText("Wind").props.accessibilityState).toMatchObject({ checked: false });
    expect(utils.getByLabelText("Swell").props.accessibilityState).toMatchObject({ checked: false });
  });

  it("closes again when the button is pressed a second time", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} />);

    await openPanel(utils);
    await openPanel(utils);

    expect(utils.queryByLabelText("Wind")).toBeNull();
  });

  it("asks to turn wind on, and swell on, independently", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} />);
    await openPanel(utils);

    await fireEvent.press(utils.getByLabelText("Wind"));
    await fireEvent.press(utils.getByLabelText("Swell"));

    expect(handlers.onWindToggle).toHaveBeenCalledTimes(1);
    expect(handlers.onSwellToggle).toHaveBeenCalledTimes(1);
  });

  it("shows which layers are on", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);
    await openPanel(utils);

    expect(utils.getByLabelText("Wind").props.accessibilityState).toMatchObject({ checked: true });
    expect(utils.getByLabelText("Swell").props.accessibilityState).toMatchObject({ checked: true });
  });
});

// The bar under the switches says what the colours mean: web's wind legend, over the same
// window the particles are coloured on (lib/weather/wind-scale.ts).
describe("MapVelocityOverlay: the wind speed legend", () => {
  it("shows the legend with its labels whenever the panel is open", async () => {
    hooks(ready, idle);
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    await openPanel(utils);

    expect(utils.getByTestId("wind-legend")).toBeTruthy();
    expect(utils.getByText(/wind speed/i)).toBeTruthy();
    for (const label of windLegendLabels()) {
      expect(utils.getByText(label)).toBeTruthy();
    }
  });

  // Web starts with wind on, so its bar is there every time the panel opens. Mobile starts with
  // the layers off, so the bar must not wait for the switch or the scale is never seen.
  it("shows the legend with wind off, and when the layers cannot be shown, such as offline", async () => {
    const windOff = await render(<MapVelocityOverlay {...baseProps} />);
    await openPanel(windOff);
    expect(windOff.getByTestId("wind-legend")).toBeTruthy();

    const offline = await render(<MapVelocityOverlay {...baseProps} windOn offline />);
    await openPanel(offline);
    expect(offline.getByTestId("wind-legend")).toBeTruthy();
  });

  it("is not there while the panel is closed", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(utils.queryByTestId("wind-legend")).toBeNull();
  });

  it("gives the wind switch the scale's swatch and the swell switch its own", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} />);

    await openPanel(utils);

    expect(utils.getByTestId("wind-swatch")).toBeTruthy();
    expect(utils.getByTestId("swell-swatch")).toBeTruthy();
  });
});

describe("MapVelocityOverlay: what is fetched and drawn", () => {
  it("fetches only the layers that are on, for the selected day and hour", async () => {
    await render(<MapVelocityOverlay {...baseProps} windOn hour={15} />);

    expect(mockUseVelocityField).toHaveBeenCalledWith({ dayId: DAY_ID, hour: 15, kind: "wind", enabled: true });
    expect(mockUseVelocityField).toHaveBeenCalledWith({ dayId: DAY_ID, hour: 15, kind: "wave", enabled: false });
  });

  it("draws nothing while a layer is still loading", async () => {
    hooks({ status: "loading", field: null, error: null }, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(mockProps.wind).toBeUndefined();
    expect(mockProps.swell).toBeUndefined();
    expect(mockProps.ring).toBeUndefined();
  });

  it("draws wind once loaded, as particles in a colour from the wind ramp", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(mockProps.wind).toBeTruthy();
    expect(mockProps.swell).toBeUndefined();
    // The colour is the shared scale's, for how strong the wind is.
    expect(mockProps.wind?.color).toBe(windSpeedColor(meanSpeed(field)));
    expect(mockProps.wind?.particleMultiplier).toBe(WIND_PARTICLE_MULTIPLIER);
    expect(mockProps.wind?.strokeWidth).toBe(WIND_STROKE_WIDTH);
  });

  it("colours a stronger wind further along the scale, and a gale as the last colour", async () => {
    const wind = (speed: number): HookState => ({
      status: "ready",
      field: { ...field, u: new Array(25).fill(speed), v: new Array(25).fill(0) },
      error: null,
    });

    hooks(wind(1), idle);
    await render(<MapVelocityOverlay {...baseProps} windOn />);
    const breeze = mockProps.wind?.color;

    hooks(wind(30), idle);
    await render(<MapVelocityOverlay {...baseProps} windOn />);
    const gale = mockProps.wind?.color;

    expect(breeze).toBe(windSpeedColor(1));
    expect(gale).toBe(WIND_SPEED_COLORS[WIND_SPEED_COLORS.length - 1]);
    expect(breeze).not.toBe(gale);
  });

  it("draws swell with its own renderer, not as wind's particles in another colour", async () => {
    hooks(idle, ready);

    await render(<MapVelocityOverlay {...baseProps} swellOn />);

    expect(mockProps.swell).toBeTruthy();
    expect(mockProps.wind).toBeUndefined();
  });

  it("draws both when both are on", async () => {
    hooks(ready, ready);

    await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);

    expect(mockProps.wind).toBeTruthy();
    expect(mockProps.swell).toBeTruthy();
  });

  it("clips each field to the disc around the day's route, as the web planner does", async () => {
    hooks(ready, ready);

    await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);

    for (const layer of [mockProps.wind, mockProps.swell]) {
      const drawn = layer?.field as VelocityField;
      // The field's far corners are tens of kilometres from a route a few km long.
      expect(drawn.u[0]).toBeNull();
      expect(drawn.u[drawn.u.length - 1]).toBeNull();
      // The cell at the middle of the field is at the route, inside the disc.
      expect(drawn.u[Math.floor(drawn.u.length / 2)]).not.toBeNull();
    }
  });

  it("gives wind the forecast disc, which web builds from the day's route, so its density can follow it", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(mockProps.wind?.disc).toEqual(discCell(dayPositions));
  });
});

describe("MapVelocityOverlay: the forecast ring", () => {
  it("is drawn around the disc that web builds from the day's route", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(mockProps.ring?.disc).toEqual(discCell(dayPositions));
  });

  it("is drawn for swell alone", async () => {
    hooks(idle, ready);

    await render(<MapVelocityOverlay {...baseProps} swellOn />);

    expect(mockProps.ring).toBeTruthy();
  });

  it("is drawn once when wind and swell are both showing", async () => {
    hooks(ready, ready);

    const { getAllByTestId } = await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);

    expect(getAllByTestId("forecast-ring")).toHaveLength(1);
  });

  it("is not drawn when no layer is showing", async () => {
    hooks(idle, idle);

    const { queryByTestId } = await render(<MapVelocityOverlay {...baseProps} />);

    expect(queryByTestId("forecast-ring")).toBeNull();
  });

});

describe("MapVelocityOverlay: saying what is going on, in the panel and not on the map", () => {
  it("says when the forecast is from, for a layer that is showing", async () => {
    hooks(ready, idle);
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    await openPanel(utils);

    // The hour being shown, and the age of the forecast as the weather panel words it.
    const hourShown = `${String(baseProps.hour).padStart(2, "0")}:00`;
    const age = formatTimeAgo(day.weather?.fetchedAt);
    expect(utils.getByText(`${hourShown} · forecast as of ${age}`)).toBeTruthy();
  });

  it("says it is loading", async () => {
    hooks({ status: "loading", field: null, error: null }, idle);
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    await openPanel(utils);

    expect(utils.getByText("Loading…")).toBeTruthy();
  });

  it("says when the day has no forecast for a layer", async () => {
    hooks(idle, { status: "empty", field: null, error: null });
    const utils = await render(<MapVelocityOverlay {...baseProps} swellOn />);

    await openPanel(utils);

    expect(utils.getByText("No forecast for this day.")).toBeTruthy();
  });

  it("shows the failure rather than a stale field", async () => {
    hooks({ status: "error", field: null, error: "Could not reach the server." }, idle);
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    await openPanel(utils);

    expect(utils.getByText("Could not reach the server.")).toBeTruthy();
    expect(mockProps.wind).toBeUndefined();
    expect(mockProps.ring).toBeUndefined();
  });

  it("says the flow is one reading for the whole area, not a spatial map", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} />);

    await openPanel(utils);

    expect(utils.getByText(/same across the whole area/i)).toBeTruthy();
  });
});

describe("MapVelocityOverlay: when the overlay cannot be shown", () => {
  it("is switched off, with the reason, when the phone is offline", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn offline />);
    await openPanel(utils);

    expect(utils.getByLabelText("Wind").props.accessibilityState).toMatchObject({ disabled: true });
    expect(utils.getByText(/needs a connection/i)).toBeTruthy();
    expect(mockUseVelocityField).toHaveBeenCalledWith(expect.objectContaining({ kind: "wind", enabled: false }));
  });

  it("is switched off until a day is selected", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} day={null} dayPositions={[]} />);
    await openPanel(utils);

    expect(utils.getByLabelText("Wind").props.accessibilityState).toMatchObject({ disabled: true });
    expect(utils.getByText(/Select a day/)).toBeTruthy();
  });

  it("is switched off for a day with no points, which has no area to forecast", async () => {
    const utils = await render(<MapVelocityOverlay {...baseProps} dayPositions={[]} />);
    await openPanel(utils);

    expect(utils.getByLabelText("Wind").props.accessibilityState).toMatchObject({ disabled: true });
    expect(utils.getByText(/no points/i)).toBeTruthy();
  });
});
