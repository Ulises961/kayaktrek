import { fireEvent, render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";

import type { VelocityField } from "@mobile/lib/weather/velocity";
import { useVelocityField } from "@mobile/lib/weather/use-velocity-field";

import { MapVelocityOverlay } from "../map-velocity-overlay";

jest.mock("@mobile/lib/weather/use-velocity-field", () => ({
  useVelocityField: jest.fn(),
}));

// The Skia overlay is covered by its own test; here it is a marker that records how it
// was asked to draw: which layer, in what colour, whether it owns the ring, and the field
// it was given.
const mockOverlayProps: Record<string, Record<string, unknown>> = {};
jest.mock("../velocity-overlay", () => ({
  VelocityOverlay: (props: { color: string; drawRing: boolean }) => {
    const { createElement } = jest.requireActual("react");
    mockOverlayProps[props.color] = props;
    return createElement("View", { testID: `velocity-overlay-${props.color}` });
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

const WHITE = "rgb(255, 255, 255)";

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
  for (const key of Object.keys(mockOverlayProps)) delete mockOverlayProps[key];
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

describe("MapVelocityOverlay: what is fetched and drawn", () => {
  it("fetches only the layers that are on, for the selected day and hour", async () => {
    await render(<MapVelocityOverlay {...baseProps} windOn hour={15} />);

    expect(mockUseVelocityField).toHaveBeenCalledWith({ dayId: DAY_ID, hour: 15, kind: "wind", enabled: true });
    expect(mockUseVelocityField).toHaveBeenCalledWith({ dayId: DAY_ID, hour: 15, kind: "wave", enabled: false });
  });

  it("draws nothing while a layer is still loading", async () => {
    hooks({ status: "loading", field: null, error: null }, idle);

    const { toJSON } = await render(<MapVelocityOverlay {...baseProps} windOn />);

    expect(Object.keys(mockOverlayProps)).toHaveLength(0);
    expect(JSON.stringify(toJSON())).not.toContain("velocity-overlay");
  });

  it("draws wind once loaded, in a colour from the wind ramp", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    const colours = Object.keys(mockOverlayProps);
    expect(colours).toHaveLength(1);
    expect(colours[0]).not.toBe(WHITE);
  });

  it("draws swell in white", async () => {
    hooks(idle, ready);

    await render(<MapVelocityOverlay {...baseProps} swellOn />);

    expect(mockOverlayProps[WHITE]).toBeTruthy();
    expect(mockOverlayProps[WHITE].strokeWidth).toBe(3.5);
  });

  it("draws swell as a dash that moves, not a line like wind", async () => {
    hooks(ready, ready);

    await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);

    const swell = mockOverlayProps[WHITE];
    const wind = Object.entries(mockOverlayProps).find(([colour]) => colour !== WHITE)?.[1];
    expect(wind).toBeTruthy();

    // A dash is one fixed length: it does not stretch with the flow's speed the way a wind
    // line does, so a fast swell and a slow one are the same dash moving at different rates.
    const swellTrail = swell.trail as { minPixels: number; maxPixels: number };
    expect(swellTrail.minPixels).toBe(swellTrail.maxPixels);
    expect(swellTrail.maxPixels).toBeLessThan(14);
    // Square ends make it a dash; wind keeps the default round ends of a line.
    expect(swell.strokeCap).toBe("butt");
    expect(wind?.strokeCap).toBeUndefined();
    // And wind keeps its own, longer, speed-scaled trails.
    expect(wind?.trail).toBeUndefined();
  });

  it("clips the field to the disc around the day's route, as the web planner does", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    const drawn = Object.values(mockOverlayProps)[0].field as VelocityField;
    // The field's far corners are tens of kilometres from a route a few km long.
    expect(drawn.u[0]).toBeNull();
    expect(drawn.u[24]).toBeNull();
    // The cell at the middle of the field is at the route, inside the disc.
    expect(drawn.u[12]).not.toBeNull();
  });

  it("gives the disc, centred on the day's route, to the layer that draws the ring", async () => {
    hooks(ready, idle);

    await render(<MapVelocityOverlay {...baseProps} windOn />);

    const wind = Object.values(mockOverlayProps)[0];
    const disc = wind.disc as { center: [number, number]; radiusKm: number };
    expect(disc.center[0]).toBeCloseTo(54.11, 6);
    expect(disc.center[1]).toBeCloseTo(-4.49, 6);
    // Web's rule: at least a 38 km radius.
    expect(disc.radiusKm).toBeGreaterThanOrEqual(38);
    expect(wind.drawRing).toBe(true);
  });

  it("draws the ring once when wind and swell are both on", async () => {
    hooks(ready, ready);

    await render(<MapVelocityOverlay {...baseProps} windOn swellOn />);

    const layers = Object.values(mockOverlayProps);
    expect(layers).toHaveLength(2);
    expect(layers.filter((layer) => layer.drawRing === true)).toHaveLength(1);
  });

  it("draws the ring from swell alone when wind is off", async () => {
    hooks(idle, ready);

    await render(<MapVelocityOverlay {...baseProps} swellOn />);

    expect(mockOverlayProps[WHITE].drawRing).toBe(true);
  });
});

describe("MapVelocityOverlay: saying what is going on, in the panel and not on the map", () => {
  it("says when the forecast is from, for a layer that is showing", async () => {
    hooks(ready, idle);
    const utils = await render(<MapVelocityOverlay {...baseProps} windOn />);

    await openPanel(utils);

    expect(utils.getByText(/12:00 · forecast as of 2 hours ago/)).toBeTruthy();
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
    expect(Object.keys(mockOverlayProps)).toHaveLength(0);
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
