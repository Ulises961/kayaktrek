import { act, render } from "@testing-library/react-native";
import type { RefObject } from "react";

import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { discOnScreen } from "@mobile/lib/weather/forecast-cell";
import type { VelocityField } from "@mobile/lib/weather/velocity";

import { VelocityOverlay } from "../velocity-overlay";

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
  Points: () => null,
  // The dashed ring, recorded as a host element so a test can tell whether it was drawn.
  Circle: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "forecast-ring", ...props });
  },
  DashPathEffect: () => null,
}));

// Reanimated loads a native worklets module jest has no binding for. Only
// useSharedValue is used, and only to hold the points handed to Skia — `mockSetPoints`
// is how a test sees what a frame drew.
const mockSetPoints = jest.fn();
jest.mock("react-native-reanimated", () => ({
  useSharedValue: <T,>(initial: T) => ({ value: initial, get: () => initial, set: mockSetPoints }),
}));

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

    const lastDrawn = mockSetPoints.mock.calls.at(-1)?.[0];
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
    const trails = mockSetPoints.mock.calls.at(-1)?.[0].length / 2;
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
    expect(mockSetPoints.mock.calls.at(-1)?.[0].length).toBeGreaterThan(0);

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
