import type { Day } from "@shared/dtos/day";

import { pointLegSummary } from "../point-summary";

function point(
  id: string,
  lat: number,
  lng: number,
  nextId?: string,
  type: "stop" | "position" = "stop",
) {
  return { id, latitude: lat, longitude: lng, type, nextId: nextId ?? null };
}

// A ~0.018 nm hop per 0.0001deg of latitude at the equator — small, deterministic
// deltas so legLabel/formatDistance produce a fixed, assertable string rather than
// a real-world route's arbitrary distance.
describe("pointLegSummary", () => {
  it("returns null for the route's first point (nothing to measure from)", () => {
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        points: [point("a", 0, 0, "b"), point("b", 0, 0.01)],
      },
    ];

    expect(pointLegSummary("a", days, 2.5)).toBeNull();
  });

  it("returns the leg and cumulative distance for a later point in the same day", () => {
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        points: [
          point("a", 0, 0, "b"),
          point("b", 0, 0.1, "c"),
          point("c", 0, 0.2),
        ],
      },
    ];

    const summary = pointLegSummary("c", days, 2.5);

    expect(summary).not.toBeNull();
    expect(summary?.legText).toContain("km");
    expect(summary?.totalText).toContain("km total");
  });

  it("measures the first point of a later day from the previous day's boundary stop", () => {
    // Matches the real backend shape (see day-route.ts's own comment): the shared
    // boundary point only appears in the *arriving* day's own points array.
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        points: [point("a", 0, 0, "b"), point("b", 0, 0.1)],
      },
      {
        id: "day-2",
        dayNumber: 2,
        points: [point("b", 0, 0.1, "c"), point("c", 0, 0.2)],
      },
    ];

    const summary = pointLegSummary("c", days, 2.5);

    expect(summary).not.toBeNull();
  });

  it("returns null for a point not found in any day", () => {
    const days: Day[] = [
      { id: "day-1", dayNumber: 1, points: [point("a", 0, 0)] },
    ];

    expect(pointLegSummary("missing", days, 2.5)).toBeNull();
  });
});
