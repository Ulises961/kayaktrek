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
        onViewPoint={jest.fn()}
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
        onViewPoint={jest.fn()}
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
        onViewPoint={jest.fn()}
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
        onViewPoint={jest.fn()}
      />,
    );

    await fireEvent.press(getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  // M9d: the leader's way into editing a point. Crew get no edit control.
  it("offers Edit to the leader", async () => {
    const onEdit = jest.fn();
    const { getByLabelText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={jest.fn()}
        onEdit={onEdit}
      />,
    );

    await fireEvent.press(getByLabelText("Edit point"));

    expect(onEdit).toHaveBeenCalled();
  });

  it("offers no Edit without an edit handler", async () => {
    const { queryByLabelText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={jest.fn()}
      />,
    );

    expect(queryByLabelText("Edit point")).toBeNull();
  });

  // M34: the bin deletes straight from the sheet, no fields to fill first —
  // same leader-only gating as Edit.
  it("offers Delete to the leader", async () => {
    const onDelete = jest.fn();
    const { getByLabelText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={jest.fn()}
        onDelete={onDelete}
      />,
    );

    await fireEvent.press(getByLabelText("Delete point"));

    expect(onDelete).toHaveBeenCalled();
  });

  it("offers no Delete without a delete handler", async () => {
    const { queryByLabelText } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={jest.fn()}
      />,
    );

    expect(queryByLabelText("Delete point")).toBeNull();
  });

  // M34 (revised): Notes and Images both navigate to the point-detail screen
  // now, instead of opening a local modal — that screen serves both roles
  // (editable for the leader, read-only for crew), so the sheet no longer
  // needs its own separate viewer surfaces.
  it("navigates to the point detail screen from the Images tile", async () => {
    const onViewPoint = jest.fn();
    const { getByTestId } = await render(
      <PointSummaryCard
        pointId="b"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={onViewPoint}
      />,
    );

    await fireEvent.press(getByTestId("point-images-tile"));

    expect(onViewPoint).toHaveBeenCalled();
  });

  it("does not navigate from the Images tile for a point with no photos", async () => {
    const onViewPoint = jest.fn();
    const { getByTestId } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={onViewPoint}
      />,
    );

    await fireEvent.press(getByTestId("point-images-tile"));

    expect(onViewPoint).not.toHaveBeenCalled();
  });

  it("navigates to the point detail screen from the Notes tile", async () => {
    const onViewPoint = jest.fn();
    const { getByTestId } = await render(
      <PointSummaryCard
        pointId="b"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={onViewPoint}
      />,
    );

    await fireEvent.press(getByTestId("point-notes-tile"));

    expect(onViewPoint).toHaveBeenCalled();
  });

  it("does not navigate from the Notes tile for a point with no notes", async () => {
    const onViewPoint = jest.fn();
    const { getByTestId } = await render(
      <PointSummaryCard
        pointId="a"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={onViewPoint}
      />,
    );

    await fireEvent.press(getByTestId("point-notes-tile"));

    expect(onViewPoint).not.toHaveBeenCalled();
  });

  it("renders nothing when the point isn't found", async () => {
    const { toJSON } = await render(
      <PointSummaryCard
        pointId="missing"
        days={days}
        avgSpeedKnots={2.5}
        onClose={jest.fn()}
        onViewPoint={jest.fn()}
      />,
    );

    expect(toJSON()).toBeNull();
  });
});
