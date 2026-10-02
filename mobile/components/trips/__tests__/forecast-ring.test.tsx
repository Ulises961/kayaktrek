import { act, render } from "@testing-library/react-native";
import type { RefObject } from "react";

import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { discOnScreen } from "@mobile/lib/weather/forecast-cell";

import { ForecastRing } from "../forecast-ring";

// Skia's canvas needs a native surface jest does not have; the pieces are replaced with
// host elements that record the props they were given.
jest.mock("@shopify/react-native-skia", () => ({
  Canvas: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "ring-canvas", ...props });
  },
  Circle: (props: object) => {
    const { createElement } = jest.requireActual("react");
    return createElement("View", { testID: "forecast-ring", ...props });
  },
  DashPathEffect: () => null,
}));

// Reanimated loads a native worklets module jest has no binding for; only useSharedValue
// is used. Every write is seen by `mockSet`, in the order the component makes them
// (centre x, centre y, radius).
const mockSet = jest.fn();
jest.mock("react-native-reanimated", () => ({
  useSharedValue: <T,>(initial: T) => {
    const { useRef } = jest.requireActual("react");
    const ref = useRef(null);
    if (ref.current === null) ref.current = { value: initial, get: () => initial, set: mockSet };
    return ref.current;
  },
}));

const disc = { center: [54.1, -4.5] as [number, number], radiusKm: 30 };
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
  return async function nextFrame() {
    now += 16;
    const callback = pending;
    pending = null;
    await act(async () => callback?.(now));
  };
}

beforeEach(() => mockSet.mockClear());
afterEach(() => jest.restoreAllMocks());

describe("ForecastRing", () => {
  it("draws a dashed ring on a canvas that lets touches through to the map", async () => {
    controlFrames();
    const { getByTestId } = await render(
      <ForecastRing disc={disc} viewRef={viewRef(flatView)} size={size} />,
    );

    expect(getByTestId("forecast-ring")).toBeTruthy();
    expect(getByTestId("ring-canvas").props.pointerEvents).toBe("none");
  });

  it("draws nothing before the map has a size", async () => {
    controlFrames();
    const { queryByTestId } = await render(
      <ForecastRing disc={disc} viewRef={viewRef(flatView)} size={{ width: 0, height: 0 }} />,
    );

    expect(queryByTestId("forecast-ring")).toBeNull();
  });

  it("follows the map: centred where the disc is, as wide as the distance it stands for", async () => {
    const nextFrame = controlFrames();
    await render(<ForecastRing disc={disc} viewRef={viewRef(flatView)} size={size} />);

    await nextFrame();

    const expected = discOnScreen(flatView, size, disc.center, disc.radiusKm);
    expect(mockSet).toHaveBeenCalledWith(expect.closeTo(expected.x, 3));
    expect(mockSet).toHaveBeenCalledWith(expect.closeTo(expected.y, 3));
    expect(mockSet).toHaveBeenCalledWith(expect.closeTo(expected.radius, 3));
  });

  it("moves with the map as it is zoomed, frame by frame, without waiting for it to settle", async () => {
    const nextFrame = controlFrames();
    const ref = viewRef(flatView);
    await render(<ForecastRing disc={disc} viewRef={ref} size={size} />);
    await nextFrame();

    const zoomedOut: MapViewState = { ...flatView, zoom: 8 };
    ref.current = zoomedOut;
    await nextFrame();

    const expected = discOnScreen(zoomedOut, size, disc.center, disc.radiusKm);
    expect(mockSet).toHaveBeenLastCalledWith(expect.closeTo(expected.radius, 3));
  });

  it("is hidden on a tilted map, where the flat projection would put it in the wrong place", async () => {
    const nextFrame = controlFrames();
    await render(<ForecastRing disc={disc} viewRef={viewRef({ ...flatView, pitch: 30 })} size={size} />);

    await nextFrame();

    const flat = discOnScreen(flatView, size, disc.center, disc.radiusKm);
    expect(mockSet).not.toHaveBeenCalledWith(expect.closeTo(flat.radius, 3));
    expect(mockSet).toHaveBeenCalledWith(0);
  });

  it("draws nothing until the map has reported its position", async () => {
    const nextFrame = controlFrames();
    await render(<ForecastRing disc={disc} viewRef={viewRef(null)} size={size} />);

    await nextFrame();
    await nextFrame();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it("stops updating when it is unmounted", async () => {
    const nextFrame = controlFrames();
    const { unmount } = await render(<ForecastRing disc={disc} viewRef={viewRef(flatView)} size={size} />);
    await nextFrame();
    await unmount();
    mockSet.mockClear();

    await nextFrame();

    expect(mockSet).not.toHaveBeenCalled();
  });
});
