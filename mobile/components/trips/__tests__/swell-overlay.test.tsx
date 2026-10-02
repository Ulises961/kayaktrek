import { act, render } from "@testing-library/react-native";
import type { RefObject } from "react";

import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { VIEW_SETTLE_MS } from "@mobile/lib/map/view-change";
import type { VelocityField } from "@mobile/lib/weather/velocity";

import { SwellOverlay } from "../swell-overlay";

// Skia's canvas needs a native surface jest does not have; its pieces become host elements
// that record the props they were drawn with.
jest.mock("@shopify/react-native-skia", () => ({
  Canvas: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "swell-canvas", ...props });
  },
  Points: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "swell-dashes", ...props });
  },
}));

// Reanimated loads a native worklets module jest has no binding for; only useSharedValue is
// used. `mockSharedValues` has one setter per shared value in the order the component makes
// them: the five opacity levels' dashes, lightest first. Each is created once and kept, like
// the real hook.
const mockSharedValues: jest.Mock[] = [];
jest.mock("react-native-reanimated", () => ({
  useSharedValue: <T,>(initial: T) => {
    const { useRef } = jest.requireActual("react");
    const ref = useRef(null);
    if (ref.current === null) {
      const set = jest.fn();
      mockSharedValues.push(set);
      ref.current = { value: initial, get: () => initial, set };
    }
    return ref.current;
  },
}));

// 5 x 5 data points ~2.8 km apart: about 62 px at zoom 10, so each is a node.
const field: VelocityField = {
  north: 54.15,
  south: 54.05,
  west: -4.585,
  east: -4.415,
  nx: 5,
  ny: 5,
  u: new Array(25).fill(3),
  v: new Array(25).fill(0),
};

const flatView: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 };
const size = { width: 400, height: 800 };

function viewRef(view: MapViewState | null): RefObject<MapViewState | null> {
  return { current: view };
}

function controlFrames() {
  let pending: ((now: number) => void) | null = null;
  let now = 1000;
  jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 1;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {
    pending = null;
  });
  return async function nextFrame(elapsedMilliseconds = 16) {
    now += elapsedMilliseconds;
    const callback = pending;
    pending = null;
    await act(async () => callback?.(now));
  };
}

// How many dashes the most recent frame left showing, across all five opacity levels. Each
// dash is a pair of points; a level that was not written this frame counts as empty.
function dashesShowing(): number {
  return mockSharedValues.reduce((total, set) => {
    const written = set.mock.calls.at(-1)?.[0] as unknown[] | undefined;
    return total + (written?.length ?? 0) / 2;
  }, 0);
}

async function advance(nextFrame: (ms?: number) => Promise<void>, totalMs: number, stepMs = 50) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) await nextFrame(stepMs);
}

beforeEach(() => {
  mockSharedValues.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe("SwellOverlay", () => {
  it("draws on a canvas that lets touches through to the map", async () => {
    controlFrames();
    const { getByTestId } = await render(
      <SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />,
    );

    expect(getByTestId("swell-canvas").props.pointerEvents).toBe("none");
  });

  it("draws nothing before the map has a size", async () => {
    controlFrames();
    const { queryByTestId } = await render(
      <SwellOverlay field={field} viewRef={viewRef(flatView)} size={{ width: 0, height: 0 }} />,
    );

    expect(queryByTestId("swell-canvas")).toBeNull();
  });

  it("draws square-ended dashes, white by default", async () => {
    controlFrames();
    const { getAllByTestId } = await render(
      <SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />,
    );

    for (const level of getAllByTestId("swell-dashes")) {
      expect(level.props.strokeCap).toBe("butt");
      expect(level.props.color).toBe("rgb(255, 255, 255)");
    }
  });

  it("draws in five opacity levels, so each dash can fade on its own", async () => {
    controlFrames();
    const { getAllByTestId } = await render(
      <SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />,
    );

    const opacities = getAllByTestId("swell-dashes").map((level) => level.props.opacity as number);
    expect(opacities).toHaveLength(5);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
    expect(new Set(opacities).size).toBe(5);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(1);
    expect(Math.min(...opacities)).toBeGreaterThan(0);
  });

  it("shows dashes once the map has reported its position, and no more than one per data point", async () => {
    const nextFrame = controlFrames();
    await render(<SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />);

    // The first frame builds the lattice; the fade-in then takes about 300 ms.
    await advance(nextFrame, 600);

    expect(dashesShowing()).toBeGreaterThan(0);
    expect(dashesShowing()).toBeLessThanOrEqual(25);
  });

  it("does not draw anything until the map has reported its position", async () => {
    const nextFrame = controlFrames();
    await render(<SwellOverlay field={field} viewRef={viewRef(null)} size={size} />);

    await advance(nextFrame, 600);

    expect(dashesShowing()).toBe(0);
  });

  it("fades in rather than popping on: nothing at the start, then dashes as it rises", async () => {
    const nextFrame = controlFrames();
    await render(<SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />);

    await nextFrame();
    expect(dashesShowing()).toBe(0);

    await advance(nextFrame, 800);
    expect(dashesShowing()).toBeGreaterThan(0);
  });

  it("takes the dashes away as soon as the map moves", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<SwellOverlay field={field} viewRef={ref} size={size} />);
    await advance(nextFrame, 800);
    expect(dashesShowing()).toBeGreaterThan(0);

    ref.current = { ...flatView, zoom: 9.6 };
    await nextFrame();

    expect(dashesShowing()).toBe(0);
  });

  it("keeps them away while the map is still moving, however long that takes", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<SwellOverlay field={field} viewRef={ref} size={size} />);
    await advance(nextFrame, 800);

    for (let step = 1; step <= 20; step++) {
      ref.current = { ...flatView, zoom: 10 - step * 0.05 };
      await nextFrame(50);
      expect(dashesShowing()).toBe(0);
    }
  });

  it("brings them back only after the map has been still for the settle time", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<SwellOverlay field={field} viewRef={ref} size={size} />);
    await advance(nextFrame, 800);

    ref.current = { ...flatView, zoom: 9.6 };
    await nextFrame();
    await advance(nextFrame, VIEW_SETTLE_MS - 100);
    expect(dashesShowing()).toBe(0);

    await advance(nextFrame, 1200);
    expect(dashesShowing()).toBeGreaterThan(0);
  });

  it("does not treat the same view reported again as movement", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<SwellOverlay field={field} viewRef={ref} size={size} />);
    await advance(nextFrame, 800);

    for (let frame = 0; frame < 30; frame++) {
      ref.current = { ...flatView, center: [...flatView.center] };
      await nextFrame(30);
    }

    expect(dashesShowing()).toBeGreaterThan(0);
  });

  it("clears the dashes on a tilted map, where the flat projection would put them in the wrong place", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<SwellOverlay field={field} viewRef={ref} size={size} />);
    await advance(nextFrame, 800);
    expect(dashesShowing()).toBeGreaterThan(0);

    ref.current = { ...flatView, pitch: 30 };
    await nextFrame();

    expect(dashesShowing()).toBe(0);
  });

  it("moves on through its cycle, so what is showing changes over time", async () => {
    const nextFrame = controlFrames();
    await render(<SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />);
    await advance(nextFrame, 800);

    const seen = new Set<string>();
    for (let frame = 0; frame < 40; frame++) {
      await nextFrame(100);
      seen.add(JSON.stringify(mockSharedValues.map((set) => set.mock.calls.at(-1)?.[0])));
    }

    expect(seen.size).toBeGreaterThan(5);
  });

  it("stops drawing when it is unmounted", async () => {
    const nextFrame = controlFrames();
    const { unmount } = await render(<SwellOverlay field={field} viewRef={viewRef(flatView)} size={size} />);
    await advance(nextFrame, 400);
    await unmount();
    for (const set of mockSharedValues) set.mockClear();

    await nextFrame();

    for (const set of mockSharedValues) expect(set).not.toHaveBeenCalled();
  });
});
