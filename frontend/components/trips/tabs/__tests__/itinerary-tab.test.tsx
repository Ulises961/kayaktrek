import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { ItineraryTab } from "../itinerary-tab"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { formatRouteRange } from "@/lib/itinerary/format"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000d01"

describe("ItineraryTab", () => {
  it("does not mislabel a routed day as 'Rest day' when startPointId is stale/missing", () => {
    // Regression for review 2.1 (M12 §A): the trip Itinerary tab listed days with real
    // 3-point routes as "Rest day" because the day-stats check trusted the boundary
    // `startPointId` field, which can go stale relative to the actual point linked
    // list. The route must render off `day.points` (ground truth), not that field.
    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i01",
      days: [
        {
          dayNumber: 1,
          date: "2026-07-01",
          startPointId: null,
          endPointId: "01952f1a-0000-7000-8000-000000000p03",
          points: [
            {
              id: "01952f1a-0000-7000-8000-000000000p01",
              name: "Start Cove",
              type: "stop",
              latitude: 42.0,
              longitude: 3.0,
              nextId: "01952f1a-0000-7000-8000-000000000p02",
            },
            {
              id: "01952f1a-0000-7000-8000-000000000p02",
              name: "Mid Point",
              type: "position",
              latitude: 42.1,
              longitude: 3.1,
              nextId: "01952f1a-0000-7000-8000-000000000p03",
            },
            {
              id: "01952f1a-0000-7000-8000-000000000p03",
              name: "End Beach",
              type: "stop",
              latitude: 42.2,
              longitude: 3.2,
              nextId: null,
            },
          ],
        },
      ],
    }

    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader={false} tripName="Test trip" />,
    )

    expect(screen.queryByText("Rest day")).toBeNull()
    expect(screen.getByText(formatRouteRange("Start Cove", "End Beach"))).toBeTruthy()
  })

  it("still labels a genuinely empty day as 'Rest day'", () => {
    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i02",
      days: [{ dayNumber: 1, date: "2026-07-01", startPointId: null, points: [] }],
    }

    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader={false} tripName="Test trip" />,
    )

    expect(screen.getByText("Rest day")).toBeTruthy()
  })

  it("shows 'X of Y days routed' against the trip's inclusive calendar span, not the raw itinerary day count", () => {
    // Regression for review 2.2 (M12 §A): the itinerary tab's own day count ("2 days")
    // competed with the trip header/trips-list calendar count ("4/5 days") instead of
    // being a progress indicator against it. The trip here spans Jul 1 -> Jul 5
    // (5 inclusive calendar days) but only Day 1 (routed) and Day 3 (an explicit empty
    // rest day) exist as itinerary.days entries — Jul 2, 4, 5 have no Day entity at
    // all (the paddler never opened the builder for them). Those un-modeled gaps must
    // still count against the total, not just the modeled empty-slice rest day.
    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i03",
      days: [
        {
          dayNumber: 1,
          date: "2026-07-01",
          startPointId: "01952f1a-0000-7000-8000-000000000p01",
          endPointId: "01952f1a-0000-7000-8000-000000000p02",
          points: [
            {
              id: "01952f1a-0000-7000-8000-000000000p01",
              name: "Start Cove",
              type: "stop",
              latitude: 42.0,
              longitude: 3.0,
              nextId: "01952f1a-0000-7000-8000-000000000p02",
            },
            {
              id: "01952f1a-0000-7000-8000-000000000p02",
              name: "End Beach",
              type: "stop",
              latitude: 42.2,
              longitude: 3.2,
              nextId: null,
            },
          ],
        },
        { dayNumber: 2, date: "2026-07-03", startPointId: null, points: [] },
      ],
    }

    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={itinerary}
        isLeader={false}
        tripName="Test trip"
        dateFrom="2026-07-01"
        dateTo="2026-07-05"
      />,
    )

    expect(screen.getByText("1 of 5")).toBeTruthy()
    expect(screen.getByText("days routed")).toBeTruthy()
  })
})
