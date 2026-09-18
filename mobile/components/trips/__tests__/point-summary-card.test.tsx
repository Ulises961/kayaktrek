import { fireEvent, render } from "@testing-library/react-native";

import type { Day } from "@shared/dtos/day";
import type { Point } from "@shared/dtos/point";

import { PointSummaryCard } from "../point-summary-card";

function point(
  id: string,
  lat: number,
  lng: number,
  nextId?: string,
  overrides: Partial<Point> = {},
) {
  return {
    id,
    latitude: lat,
    longitude: lng,
    type: "stop" as const,
    nextId: nextId ?? null,
    ...overrides,
  };
}

const days: Day[] = [
  {
    id: "day-1",
    dayNumber: 1,
    points: [
      point("a", 0, 0, "b", { name: "Harbour" }),
      point("b", 0, 0.1, undefined, {
        type: "position",
        notes: "Watch the current here",
        images: [
          {
            id: "img-1",
            size: 1024,
            name: "a.jpg",
            location: "r2://a",
            isPublic: false,
          },
          {
            id: "img-2",
            size: 2048,
            name: "b.jpg",
            location: "r2://b",
            isPublic: false,
          },
        ],
      }),
    ],
  },
];

describe("PointSummaryCard", () => {
  it("shows the point's type, name, and Start for the route's first point", async () => {
    const { getByText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
      />,
    );

    expect(getByText("Harbour")).toBeTruthy();
    expect(getByText("stop")).toBeTruthy();
    expect(getByText("Start")).toBeTruthy();
  });

  it("shows the leg distance and notes for a later point", async () => {
    const { getAllByText, getByText } = await render(
      <PointSummaryCard
        pointId="b"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
      />,
    );

    // Unnamed point falls back to its type as the display name — "position"
    // appears both as the type label and as that fallback name.
    expect(getAllByText("position")).toHaveLength(2);
    expect(getByText("Watch the current here")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("shows a dash for a point with no notes", async () => {
    const { getByText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
      />,
    );

    expect(getByText("—")).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={onClose}
      />,
    );

    await fireEvent.press(getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when the point isn't found", async () => {
    const { toJSON } = await render(
      <PointSummaryCard
        pointId="missing"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
      />,
    );

    expect(toJSON()).toBeNull();
  });
});
