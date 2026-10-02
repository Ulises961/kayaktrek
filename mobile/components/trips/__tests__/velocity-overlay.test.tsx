import { act, render } from "@testing-library/react-native";
import type { RefObject } from "react";

import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { discOnScreen } from "@mobile/lib/weather/forecast-cell";
import type { VelocityField } from "@mobile/lib/weather/velocity";

import { VelocityOverlay, VIEW_SETTLE_MS } from "../velocity-overlay";

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
  // The dashed ring, recorded as a host element so a test can tell whether it was drawn.
  Circle: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "forecast-ring", ...props });
  },
  DashPathEffect: () => null,
}));

// Reanimated loads a native worklets module jest has no binding for. Only
// useSharedValue is used, and only to hold what is handed to Skia. Every write is seen
// by `mockSetPoints`; `mockSharedValues` has one setter per shared value in the order the
// component creates them (trails, ring x, ring y, ring radius, opacity), so a test can ask
// about one of them. Like the real hook, each value is created once and kept.
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
        particleMultiplier={0.0016}
      />,
    );

    await nextFrame(); // seeds, and starts the clock
    await nextFrame();

    // (400 + 48) x (800 + 48) px of particle area x 0.0016 is about 608 trails.
    const trails = (lastTrails()?.length ?? 0) / 2;
    expect(trails).toBeGreaterThan(608 * 0.9);
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

    // The trails are cleared (the ring is cleared too, which is why this is not the last call).
    expect(mockSetPoints).toHaveBeenCalledWith([]);
  });

  // The forecast cell: the field is shown inside a disc, and a dashed ring marks where the
  // forecast stops (web's ForecastCellShell). The disc is centred on [latitude, longitude].
  describe("forecast area ring", () => {
    const disc = { center: [54.1, -4.5] as [number, number], radiusKm: 30 };

    it("is drawn when a disc is given and this layer owns the ring", async () => {
      controlFrames();
      const { getByTestId } = await render(
        <VelocityOverlay
          field={field}
          viewRef={viewRef(flatView)}
          size={size}
          color="rgb(40, 170, 180)"
          disc={disc}
          drawRing
        />,
      );

      expect(getByTestId("forecast-ring")).toBeTruthy();
    });

    it("is left to the other layer when both wind and swell are on", async () => {
      controlFrames();
      const { queryByTestId } = await render(
        <VelocityOverlay
          field={field}
          viewRef={viewRef(flatView)}
          size={size}
          color="rgb(40, 170, 180)"
          disc={disc}
          drawRing={false}
        />,
      );

      expect(queryByTestId("forecast-ring")).toBeNull();
    });

    it("follows the map: centred where the disc is, as wide as the distance it stands for", async () => {
      const nextFrame = controlFrames();
      await render(
        <VelocityOverlay
          field={field}
          viewRef={viewRef(flatView)}
          size={size}
          color="rgb(40, 170, 180)"
          disc={disc}
          drawRing
        />,
      );

      await nextFrame();
      await nextFrame();

      const expected = discOnScreen(flatView, size, disc.center, disc.radiusKm);
      expect(mockSetPoints).toHaveBeenCalledWith(expect.closeTo(expected.x, 3));
      expect(mockSetPoints).toHaveBeenCalledWith(expect.closeTo(expected.y, 3));
      expect(mockSetPoints).toHaveBeenCalledWith(expect.closeTo(expected.radius, 3));
    });

    it("is hidden on a tilted map, where the flat projection would put it in the wrong place", async () => {
      const nextFrame = controlFrames();
      await render(
        <VelocityOverlay
          field={field}
          viewRef={viewRef({ ...flatView, pitch: 30 })}
          size={size}
          color="rgb(40, 170, 180)"
          disc={disc}
          drawRing
        />,
      );

      await nextFrame();
      await nextFrame();

      const expected = discOnScreen(flatView, size, disc.center, disc.radiusKm);
      expect(mockSetPoints).not.toHaveBeenCalledWith(expect.closeTo(expected.radius, 3));
      expect(mockSetPoints).toHaveBeenCalledWith(0);
    });
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
          disc={disc}
          drawRing
        />,
      );
    }

    async function settleFrames(nextFrame: (ms?: number) => Promise<void>, totalMs: number) {
      for (let elapsed = 0; elapsed < totalMs; elapsed += 50) await nextFrame(50);
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
        await nextFrame(50);
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
      await settleFrames(nextFrame, VIEW_SETTLE_MS - 100);
      expect(lastTrails()).toEqual([]);

      await settleFrames(nextFrame, 300);
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
      ref.current = { ...flatView, zoom: 9 };
      await nextFrame();
      await settleFrames(nextFrame, VIEW_SETTLE_MS + 200);
      await nextFrame();
      await nextFrame();
      const after = (lastTrails()?.length ?? 0) / 2;

      expect(before).toBeGreaterThan(100);
      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThan(before / 5);
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
      await settleFrames(nextFrame, VIEW_SETTLE_MS + 200);
      await nextFrame();
      await nextFrame();

      expect(lastTrails()?.length).toBeGreaterThan(0);
    });

    it("keeps the ring following the map the whole time, even while the trails are away", async () => {
      const nextFrame = controlFrames();
      const ref = viewRef({ ...flatView, zoom: 12 });
      await renderMoving(ref);
      await nextFrame();
      await nextFrame();

      const zoomedOut: MapViewState = { ...flatView, zoom: 9 };
      ref.current = zoomedOut;
      await nextFrame();

      const expected = discOnScreen(zoomedOut, size, disc.center, disc.radiusKm);
      expect(lastTrails()).toEqual([]);
      expect(mockSetPoints).toHaveBeenCalledWith(expect.closeTo(expected.radius, 3));
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
      const opacity = mockSharedValues[4];

      ref.current = { ...flatView, zoom: 11.6 };
      await nextFrame();
      expect(opacity).toHaveBeenLastCalledWith(0);

      await settleFrames(nextFrame, VIEW_SETTLE_MS + 100);
      await nextFrame(40);
      const partway = opacity.mock.calls.at(-1)?.[0] as number;
      expect(partway).toBeGreaterThan(0);
      expect(partway).toBeLessThan(0.85);

      await settleFrames(nextFrame, 600);
      expect(opacity).toHaveBeenLastCalledWith(0.85);
    });
  });

  describe("how the trails are drawn", () => {
    it("has round ends by default, like wind's long lines", async () => {
      controlFrames();
      const { getByTestId } = await render(
        <VelocityOverlay field={field} viewRef={viewRef(flatView)} size={size} color="rgb(40, 170, 180)" />,
      );

      expect(getByTestId("trails").props.strokeCap).toBe("round");
    });

    it("can have square ends, which is what makes swell read as dashes", async () => {
      controlFrames();
      const { getByTestId } = await render(
        <VelocityOverlay
          field={field}
          viewRef={viewRef(flatView)}
          size={size}
          color="rgb(255, 255, 255)"
          strokeCap="butt"
        />,
      );

      expect(getByTestId("trails").props.strokeCap).toBe("butt");
    });
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
