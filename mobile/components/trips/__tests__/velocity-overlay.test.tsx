import { act, render } from "@testing-library/react-native";
import type { RefObject } from "react";

import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { VIEW_SETTLE_MS } from "@mobile/lib/map/view-change";
import type { VelocityField } from "@mobile/lib/weather/velocity";
import {
  AREA_PADDING_PX,
  particleCountFor,
  particleCountForForecast,
} from "@mobile/lib/weather/velocity-frame";

import { VelocityOverlay, WIND_FADE_IN_MS, WIND_TRAIL_OPACITY } from "../velocity-overlay";

// The density these tests ask the overlay for; what they expect is worked out from it with the
// real density functions, not copied.
const MULTIPLIER = 0.0016;

// Skia's canvas needs a native surface jest does not have, so it is replaced with a
// plain View that records the props it was given. What is under test is when the
// overlay draws, not Skia.
jest.mock("@shopify/react-native-skia", () => ({
  // A host "View" element rather than the imported component: resolving react-native's
  // View while the module graph is loading hits react-native-css before it is ready.
  Canvas: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "velocity-canvas", ...props });
  },
  // Recorded as a host element so a test can read the props it was drawn with.
  Points: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "trails", ...props });
  },
}));

// Reanimated loads a native worklets module jest has no binding for. Only
// useSharedValue is used, and only to hold what is handed to Skia. Every write is seen
// by `mockSetPoints`; `mockSharedValues` has one setter per shared value in the order the
// component creates them (trails, opacity), so a test can ask about one of them. Like the real hook, each value is created once and kept.
const mockSetPoints = jest.fn();
const mockSharedValues: jest.Mock[] = [];
jest.mock("react-native-reanimated", () => ({
  useSharedValue: <T,>(initial: T) => {
    const { useRef } = jest.requireActual("react");
    const ref = useRef(null);
    if (ref.current === null) {
      const set = jest.fn((value: unknown) => mockSetPoints(value));
      mockSharedValues.push(set);
      ref.current = { value: initial, get: () => initial, set };
    }
    return ref.current;
  },
}));

// The trails written by the most recent frame that wrote any (the other shared values
// are numbers).
function lastTrails(): unknown[] | undefined {
  return mockSetPoints.mock.calls
    .map(([value]) => value)
    .filter(Array.isArray)
    .at(-1);
}

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

const flatView: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 };
const size = { width: 400, height: 800 };

function viewRef(view: MapViewState | null): RefObject<MapViewState | null> {
  return { current: view };
}

// Replaces requestAnimationFrame so a test decides when frames happen, and how far
// apart: each call to the returned function runs the callback the loop last asked for.
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

beforeEach(() => {
  mockSetPoints.mockClear();
  mockSharedValues.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("VelocityOverlay", () => {
  it("draws a canvas over the map that lets touches through to it", async () => {
    controlFrames();
    const { getByTestId } = await render(
      <VelocityOverlay field={field} viewRef={viewRef(flatView)} size={size} color="rgb(40, 170, 180)" />,
    );

    expect(getByTestId("velocity-canvas").props.pointerEvents).toBe("none");
  });

  it("draws nothing before the map has a size", async () => {
    controlFrames();
    const { queryByTestId } = await render(
      <VelocityOverlay
        field={field}
        viewRef={viewRef(flatView)}
        size={{ width: 0, height: 0 }}
        color="rgb(40, 170, 180)"
      />,
    );

    expect(queryByTestId("velocity-canvas")).toBeNull();
  });

  it("draws streaks once the map has reported its position", async () => {
    const nextFrame = controlFrames();
    await render(
      <VelocityOverlay field={field} viewRef={viewRef(flatView)} size={size} color="rgb(40, 170, 180)" />,
    );

    await nextFrame(); // the first frame only starts the clock
    await nextFrame();

    const lastDrawn = lastTrails() ?? [];
    expect(lastDrawn.length).toBeGreaterThan(0);
    expect(lastDrawn.length % 2).toBe(0); // streaks are drawn as pairs of points
  });

  it("keeps the density the screen asks for when the field is far bigger than the screen", async () => {
    // The field spans 0.4 degrees; at zoom 14 the screen shows a small fraction of it. Particles
    // spread across the whole field would leave almost none of them on screen.
    const nextFrame = controlFrames();
    await render(
      <VelocityOverlay
        field={field}
        viewRef={viewRef({ ...flatView, zoom: 14 })}
        size={size}
        color="rgb(40, 170, 180)"
        particleMultiplier={MULTIPLIER}
      />,
    );

    await nextFrame(); // seeds, and starts the clock
    await nextFrame();

    // Particles live in the screen plus its margin, at the density the multiplier asks for.
    const asked = particleCountFor(
      { width: size.width + 2 * AREA_PADDING_PX, height: size.height + 2 * AREA_PADDING_PX },
      MULTIPLIER,
    );
    const trails = (lastTrails()?.length ?? 0) / 2;
    expect(trails).toBeGreaterThan(asked * 0.9);
    expect(trails).toBeLessThanOrEqual(asked);
  });

  it("draws nothing until the map has reported its position", async () => {
    const nextFrame = controlFrames();
    await render(
      <VelocityOverlay field={field} viewRef={viewRef(null)} size={size} color="rgb(40, 170, 180)" />,
    );

    await nextFrame();
    await nextFrame();

    expect(mockSetPoints).not.toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });

  it("clears the streaks on a tilted map, where the flat projection would put them in the wrong place", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<VelocityOverlay field={field} viewRef={ref} size={size} color="rgb(40, 170, 180)" />);
    await nextFrame();
    await nextFrame();
    expect(lastTrails()?.length).toBeGreaterThan(0);

    ref.current = { ...flatView, pitch: 30 };
    await nextFrame();

    expect(lastTrails()).toEqual([]);
  });

  // While the map is being zoomed or panned the animation is taken away, and put back only
  // once the view has stopped changing and the area it covers has been worked out again —
  // as web does (it hides on movestart/zoomstart and waits for the field to settle). Drawing
  // through the gesture shows a field for ground the screen is no longer looking at.
  describe("while the map moves", () => {
    // A forecast disc round the view, large enough that zooming out changes how much of the
    // screen it covers.
    const disc = { center: [54.1, -4.5] as [number, number], radiusKm: 5 };
    const wideField: VelocityField = { ...field, north: 54.6, south: 53.6, west: -5.0, east: -4.0 };

    function renderMoving(ref: RefObject<MapViewState | null>) {
      return render(
        <VelocityOverlay
          field={wideField}
          viewRef={ref}
          size={size}
          color="rgb(40, 170, 180)"
          particleMultiplier={MULTIPLIER}
          disc={disc}
        />,
      );
    }

    // Frames fine enough to catch the moment the settle time runs out: a quarter of it each.
    const STEP_MS = VIEW_SETTLE_MS / 4;
    async function settleFrames(nextFrame: (ms?: number) => Promise<void>, totalMs: number) {
      for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) await nextFrame(STEP_MS);
    }

    it("takes the trails away as soon as the view changes", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();
      expect(lastTrails()?.length).toBeGreaterThan(0);

      ref.current = { ...flatView, zoom: 11.6 };
      await nextFrame();

      expect(lastTrails()).toEqual([]);
    });

    it("keeps them away while the view is still changing, however long that takes", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();

      // A pinch: the zoom changes a little on every frame for most of a second.
      for (let step = 1; step <= 20; step++) {
        ref.current = { ...flatView, zoom: 12 - step * 0.05 };
        await nextFrame(STEP_MS);
        expect(lastTrails()).toEqual([]);
      }
    });

    it("brings them back only after the view has been still for the settle time", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();

      ref.current = { ...flatView, zoom: 11.6 };
      await nextFrame();
      await settleFrames(nextFrame, VIEW_SETTLE_MS / 2);
      expect(lastTrails()).toEqual([]);

      await settleFrames(nextFrame, VIEW_SETTLE_MS);
      await nextFrame();
      await nextFrame();
      expect(lastTrails()?.length).toBeGreaterThan(0);
    });

    it("works the density out again for the new zoom, so zooming out thins the trails", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();
      const before = (lastTrails()?.length ?? 0) / 2;

      // Far out: the 5 km disc is now a small circle on the screen, and gets few particles.
      const zoomedOut: MapViewState = { ...flatView, zoom: 9 };
      ref.current = zoomedOut;
      await nextFrame();
      await settleFrames(nextFrame, VIEW_SETTLE_MS * 2);
      await nextFrame();
      await nextFrame();
      const after = (lastTrails()?.length ?? 0) / 2;

      // What the density rule asks for at each zoom, from the real functions.
      const askedBefore = particleCountForForecast({ ...flatView, zoom: 12 }, size, disc, MULTIPLIER);
      const askedAfter = particleCountForForecast(zoomedOut, size, disc, MULTIPLIER);
      expect(askedAfter).toBeLessThan(askedBefore);
      expect(before).toBeGreaterThan(askedBefore * 0.8);
      expect(before).toBeLessThanOrEqual(askedBefore);
      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThanOrEqual(askedAfter);
    });

    it("spreads the new particles over the new area, not where the old ones were", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();

      // Panned a long way off: the old particles' ground is no longer on screen at all.
      ref.current = { ...flatView, center: [-4.46, 54.1], zoom: 12 };
      await nextFrame();
      await settleFrames(nextFrame, VIEW_SETTLE_MS * 2);
      await nextFrame();
      await nextFrame();

      expect(lastTrails()?.length).toBeGreaterThan(0);
    });

    it("does not treat an unchanged view as movement, so the animation is not restarted every frame", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();

      for (let frame = 0; frame < 30; frame++) {
        // The map reports the same view again and again while at rest.
        ref.current = { ...flatView, zoom: 12 };
        await nextFrame();
        expect(lastTrails()?.length).toBeGreaterThan(0);
      }
    });

    it("fades the trails back in rather than popping them on", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();
      const opacity = mockSharedValues[1];

      ref.current = { ...flatView, zoom: 11.6 };
      await nextFrame();
      expect(opacity).toHaveBeenLastCalledWith(0);

      // Once the view has settled and the trails are seeded, the opacity climbs rather than jumps.
      await settleFrames(nextFrame, VIEW_SETTLE_MS + STEP_MS);
      await nextFrame(WIND_FADE_IN_MS / 4);
      const partway = opacity.mock.calls.at(-1)?.[0] as number;
      expect(partway).toBeGreaterThan(0);
      expect(partway).toBeLessThan(WIND_TRAIL_OPACITY);

      await settleFrames(nextFrame, WIND_FADE_IN_MS * 2);
      expect(opacity).toHaveBeenLastCalledWith(WIND_TRAIL_OPACITY);
    });
  });

  it("draws wind as long round-ended lines in the colour it is given", async () => {
    controlFrames();
    const { getByTestId } = await render(
      <VelocityOverlay field={field} viewRef={viewRef(flatView)} size={size} color="rgb(40, 170, 180)" />,
    );

    expect(getByTestId("trails").props.strokeCap).toBe("round");
    expect(getByTestId("trails").props.color).toBe("rgb(40, 170, 180)");
  });

  it("stops drawing when it is unmounted", async () => {
    const nextFrame = controlFrames();
    const { unmount } = await render(
      <VelocityOverlay field={field} viewRef={viewRef(flatView)} size={size} color="rgb(40, 170, 180)" />,
    );
    await nextFrame();
    await unmount();
    mockSetPoints.mockClear();

    await nextFrame();

    expect(mockSetPoints).not.toHaveBeenCalled();
  });
});
