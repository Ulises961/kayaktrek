import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateItinerary, mockPush } = vi.hoisted(() => ({
  mockCreateItinerary: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createItinerary: mockCreateItinerary,
}))

import { ItineraryTab } from "../itinerary-tab"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"
import { formatDateRange } from "@/lib/trips/format"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITIN_ID = "01952f1a-0000-7000-8000-000000000002"
const DAY_1_ID = "01952f1a-0000-7000-8000-000000000010"
const DAY_2_ID = "01952f1a-0000-7000-8000-000000000011"
const PT_A_ID = "01952f1a-0000-7000-8000-100000000001"
const PT_B_ID = "01952f1a-0000-7000-8000-100000000002"
const PT_C_ID = "01952f1a-0000-7000-8000-100000000003"

const PT_A: Point = {
  id: PT_A_ID,
  type: "stop",
  latitude: 43.5,
  longitude: -8.0,
  name: "Ribadeo",
  nextId: PT_B_ID,
  dayId: DAY_1_ID,
}
const PT_B: Point = {
  id: PT_B_ID,
  type: "position",
  latitude: 43.6,
  longitude: -8.1,
  name: null,
  nextId: PT_C_ID,
  dayId: DAY_1_ID,
}
const PT_C: Point = {
  id: PT_C_ID,
  type: "stop",
  latitude: 43.7,
  longitude: -7.9,
  name: "Foz",
  nextId: null,
  dayId: DAY_1_ID,
}

const DAY_WITH_POINTS: Day = {
  id: DAY_1_ID,
  dayNumber: 1,
  date: "2026-07-01",
  startPointId: PT_A_ID,
  endPointId: PT_C_ID,
  points: [PT_A, PT_B, PT_C],
}

const DAY_REST: Day = {
  id: DAY_2_ID,
  dayNumber: 2,
  date: "2026-07-03",
  startPointId: null,
  endPointId: null,
  points: [],
}

const ITIN_NO_DAYS: Itinerary = {
  id: ITIN_ID,
  tripId: TRIP_ID,
  isPublic: false,
  totalMiles: 0,
  days: [],
}

const ITIN_WITH_DAYS: Itinerary = {
  id: ITIN_ID,
  tripId: TRIP_ID,
  isPublic: false,
  totalMiles: 22.4,
  avgSpeedKnots: 2.5,
  days: [DAY_WITH_POINTS, DAY_REST],
}

// 6 days so "show all" toggle appears
const MANY_DAYS: Day[] = Array.from({ length: 6 }, (_, i) => ({
  id: `01952f1a-0000-7000-8000-00000000002${i}`,
  dayNumber: i + 1,
  date: `2026-07-0${i + 1}`,
  startPointId: null,
  endPointId: null,
  points: [],
}))

const ITIN_MANY_DAYS: Itinerary = {
  ...ITIN_WITH_DAYS,
  days: MANY_DAYS,
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// No itinerary
// ---------------------------------------------------------------------------

describe("ItineraryTab — no itinerary", () => {
  it("shows a name input for the leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    expect(screen.getByRole("textbox")).toBeDefined()
  })

  it("shows a create button for the leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    expect(screen.getByRole("button", { name: /create itinerary/i })).toBeDefined()
  })

  it("create button is disabled when name is empty", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    const btn = screen.getByRole("button", { name: /create itinerary/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it("calls createItinerary with name and tripId on submit", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITIN_ID })
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    await userEvent.type(screen.getByRole("textbox"), "Galician Coast")
    await userEvent.click(screen.getByRole("button", { name: /create itinerary/i }))
    expect(mockCreateItinerary).toHaveBeenCalledWith({ tripId: TRIP_ID, name: "Galician Coast" })
  })

  it("navigates to the itinerary page on success", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITIN_ID })
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    await userEvent.type(screen.getByRole("textbox"), "Galician Coast")
    await userEvent.click(screen.getByRole("button", { name: /create itinerary/i }))
    expect(mockPush).toHaveBeenCalledWith(`/itinerary/${ITIN_ID}`)
  })

  it("shows no itinerary message for crew", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.getByText(/no itinerary/i)).toBeDefined()
  })

  it("does not show a create button for crew", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /create itinerary/i })).toBeNull()
  })

  it("pre-fills the name input with tripName when provided", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader tripName="Costa Brava" />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("Costa Brava")
  })

  it("leaves the name input empty when tripName is not provided", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Draft (itinerary exists, no days)
// ---------------------------------------------------------------------------

describe("ItineraryTab — draft (itinerary with no days)", () => {
  it("shows draft status", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_NO_DAYS} isLeader />)
    expect(screen.getByText(/draft/i)).toBeDefined()
  })

  it("shows a link to the itinerary page", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_NO_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })
})

// ---------------------------------------------------------------------------
// With days
// ---------------------------------------------------------------------------

describe("ItineraryTab — itinerary with days", () => {
  it("shows day count in stats strip", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    // day count and label are in nested spans; match the parent element's textContent
    const el = screen.getByText(
      (_, node) => node?.textContent?.replace(/\s+/g, " ").trim() === "2 days",
    )
    expect(el).toBeDefined()
  })

  it("shows total distance in stats strip, nm by default", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/22\.4 nm/)).toBeDefined()
  })

  it("converts total distance to km when unit is km", () => {
    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader unit={DISTANCE_UNIT.KM} />,
    )
    expect(screen.getByText(`${formatDistance(22.4, DISTANCE_UNIT.KM)} km`)).toBeDefined()
    expect(screen.queryByText(/22\.4 nm/)).toBeNull()
  })

  it("converts day-row distance to km when unit is km, not nm", () => {
    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader unit={DISTANCE_UNIT.KM} />,
    )
    expect(screen.getAllByText(/km ·/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/nm ·/)).toBeNull()
  })

  it("shows date range", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(formatDateRange("2026-07-01", "2026-07-03"))).toBeDefined()
  })

  it("renders a row for each day", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/Day 1/)).toBeDefined()
    expect(screen.getByText(/Day 2/)).toBeDefined()
  })

  it("does not show point/route names — the day row is just day number, date, and stats", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.queryByText("Ribadeo")).toBeNull()
    expect(screen.queryByText("Foz")).toBeNull()
    expect(screen.queryByText(/Ribadeo.*Foz/)).toBeNull()
  })

  it("shows a dash for a rest day's stats instead of hiding the line", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows rest day label for days without points", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/rest day/i)).toBeDefined()
  })

  it("shows Open itinerary link for leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })

  it("shows Open itinerary link for crew too", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader={false} />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })

  it("collapses to 5 days and shows a show-all toggle", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_MANY_DAYS} isLeader />)
    expect(screen.queryByText(/Day 6/)).toBeNull()
    expect(screen.getByRole("button", { name: /show all/i })).toBeDefined()
  })

  it("show-all toggle reveals remaining days", async () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_MANY_DAYS} isLeader />)
    await userEvent.click(screen.getByRole("button", { name: /show all/i }))
    expect(screen.getByText(/Day 6/)).toBeDefined()
  })

  it("orders the day list by dayNumber, not by array/date order", () => {
    // Day 2 (no date) arrives before Day 1 (dated) in itinerary.days — the
    // rendered list must still show Day 1 first.
    const itinerary: Itinerary = {
      ...ITIN_WITH_DAYS,
      days: [DAY_REST, DAY_WITH_POINTS],
    }
    render(<ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader />)
    // Date now leads (item 11 follow-up), so "Day N" renders as "· Day N" — strip
    // the separator to isolate the ordering assertion.
    const dayLabels = screen
      .getAllByText(/Day \d$/)
      .map((el) => el.textContent?.replace(/^·\s*/, ""))
    expect(dayLabels).toEqual(["Day 1", "Day 2"])
  })
})

// ---------------------------------------------------------------------------
// Stats rework — rename/add/remove (item 11 follow-up)
// ---------------------------------------------------------------------------

describe("ItineraryTab — stats rework", () => {
  it("labels the routed-days stat 'paddling days', not 'days routed'", () => {
    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={ITIN_WITH_DAYS}
        isLeader
        dateFrom="2026-07-01"
        dateTo="2026-07-03"
      />,
    )
    // ITIN_WITH_DAYS has exactly 1 routed day (DAY_WITH_POINTS) -> singular.
    expect(screen.getByText("paddling day")).toBeInTheDocument()
    expect(screen.queryByText("days routed")).toBeNull()
  })

  it("shows a calculated rest-days stat: total calendar span minus routed days", () => {
    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={ITIN_WITH_DAYS}
        isLeader
        dateFrom="2026-07-01"
        dateTo="2026-07-03"
      />,
    )
    // 3 calendar days (Jul 1-3 inclusive), 1 routed (DAY_WITH_POINTS) -> 2 rest days.
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("rest days")).toBeInTheDocument()
  })

  it("hides the rest-days stat when every calendar day is routed", () => {
    const itinerary: Itinerary = { ...ITIN_WITH_DAYS, days: [DAY_WITH_POINTS] }
    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={itinerary}
        isLeader
        dateFrom="2026-07-01"
        dateTo="2026-07-01"
      />,
    )
    expect(screen.queryByText(/rest day/i)).toBeNull()
  })

  it("labels the average-time stat 'avg paddling time / day', not 'avg / day'", () => {
    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={ITIN_WITH_DAYS}
        isLeader
        dateFrom="2026-07-01"
        dateTo="2026-07-03"
      />,
    )
    expect(screen.getByText("avg paddling time / day")).toBeInTheDocument()
    expect(screen.queryByText("avg / day")).toBeNull()
  })

  it("never shows a stops stat", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.queryByText(/^stops?$/)).toBeNull()
  })

  it("widens the total-days span to cover a Day dated past the trip's own dateTo, so rest days aren't undercounted", () => {
    // Regression: a paddler added Day 5 dated 7 Aug without the trip's own dateTo
    // (still 3 Aug, e.g. never edited after the day was added) ever catching up.
    // The visible date-span line already derives from the itinerary's real day
    // dates (28 Jul - 7 Aug, 11 days) — the rest-days stat must agree with it,
    // not silently use the narrower 7-day trip-level span (which would undercount
    // rest days as 2 instead of the real 6).
    const routedDay = (dayNumber: number, date: string, idSuffix: string): Day => ({
      id: `01952f1a-0000-7000-8000-00000000d${idSuffix}`,
      dayNumber,
      date,
      startPointId: null,
      points: [
        {
          id: `01952f1a-0000-7000-8000-00000000a${idSuffix}`,
          type: "stop",
          latitude: 42.0,
          longitude: 3.0,
          nextId: `01952f1a-0000-7000-8000-00000000b${idSuffix}`,
        },
        {
          id: `01952f1a-0000-7000-8000-00000000b${idSuffix}`,
          type: "stop",
          latitude: 42.1,
          longitude: 3.1,
          nextId: null,
        },
      ],
    })

    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i07",
      totalMiles: 24.4,
      days: [
        routedDay(1, "2026-07-28", "1"),
        routedDay(2, "2026-07-29", "2"),
        routedDay(3, "2026-08-01", "3"),
        routedDay(4, "2026-08-05", "4"),
        routedDay(5, "2026-08-07", "5"),
      ],
    }

    render(
      <ItineraryTab
        tripId={TRIP_ID}
        itinerary={itinerary}
        isLeader
        dateFrom="2026-07-28"
        dateTo="2026-08-03"
      />,
    )

    expect(screen.getByText(formatDateRange("2026-07-28", "2026-08-07"))).toBeInTheDocument()
    expect(screen.getByText("6")).toBeInTheDocument()
    expect(screen.getByText("rest days")).toBeInTheDocument()
    expect(screen.queryByText("2")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// §A regressions (rest-day mislabel, day-count arithmetic)
// ---------------------------------------------------------------------------

describe("ItineraryTab — §A regressions", () => {
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
    // A real distance/time line rendering (not the "—" no-info fallback) confirms
    // getDayStats correctly resolved this as a routed day, not a rest day.
    expect(screen.getByText(/nm ·/)).toBeTruthy()
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

  it("counts paddling/rest days against the trip's inclusive calendar span, not the raw itinerary day count", () => {
    // Regression for review 2.2 (M12 §A): the itinerary tab's own day count ("2 days")
    // competed with the trip header/trips-list calendar count ("4/5 days") instead of
    // being a progress indicator against it. The trip here spans Jul 1 -> Jul 5
    // (5 inclusive calendar days) but only Day 1 (routed) and Day 3 (an explicit empty
    // rest day) exist as itinerary.days entries — Jul 2, 4, 5 have no Day entity at
    // all (the paddler never opened the builder for them). Those un-modeled gaps must
    // still count against the total (rest days = 5 - 1 = 4), not just the modeled
    // empty-slice rest day.
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

    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getByText("paddling day")).toBeTruthy()
    expect(screen.getByText("4")).toBeTruthy()
    expect(screen.getByText("rest days")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// §M — shared boundary-stop derivation (M12 phase 5)
// ---------------------------------------------------------------------------

describe("ItineraryTab — §M shared boundary-stop derivation", () => {
  // Simulates single-owner storage: the stop shared between day 1 and day 2
  // physically belongs to day 2's `points` array (as the real backend's
  // apply_boundaries assigns it), not day 1's — even though it's day 1's own
  // endPointId. The tab must still walk it via boundary metadata.
  const SHARED_ID = "01952f1a-0000-7000-8000-000000000p02"

  const itinerary: Itinerary = {
    id: "01952f1a-0000-7000-8000-000000000i04",
    days: [
      {
        dayNumber: 1,
        date: "2026-07-01",
        startPointId: "01952f1a-0000-7000-8000-000000000p01",
        endPointId: SHARED_ID,
        points: [
          {
            id: "01952f1a-0000-7000-8000-000000000p01",
            name: "Start Cove",
            type: "stop",
            latitude: 42.0,
            longitude: 3.0,
            nextId: SHARED_ID,
          },
          // The shared stop is deliberately absent from day 1's own `points` —
          // it lives on day 2 below, mirroring real storage ownership.
        ],
      },
      {
        dayNumber: 2,
        date: "2026-07-02",
        startPointId: SHARED_ID,
        endPointId: "01952f1a-0000-7000-8000-000000000p03",
        points: [
          {
            id: SHARED_ID,
            name: "Shared Anchorage",
            type: "stop",
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

  it("day 1's distance includes the leg into the shared boundary stop, not just its own owned points", () => {
    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader={false} tripName="Test trip" />,
    )
    // A real distance/time line (not the "—" no-info fallback) renders only when
    // distanceNm > 0 — without the fix, day 1 resolves to a single owned point (zero
    // distance) and shows "—", so only day 2's would show a real line. Both days
    // must show one here.
    expect(screen.getAllByText(/nm ·/)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// §I — rest-gap visualization
// ---------------------------------------------------------------------------

describe("ItineraryTab — §I rest-gap visualization", () => {
  it("shows a Rest entry between two dated days with a calendar gap", () => {
    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i05",
      days: [
        { dayNumber: 1, date: "2026-07-01", startPointId: null, points: [] },
        { dayNumber: 2, date: "2026-07-03", startPointId: null, points: [] },
      ],
    }
    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader={false} tripName="Test trip" />,
    )
    expect(screen.getByTestId("rest-gap-entry")).toBeInTheDocument()
  })

  it("does not show a Rest entry when there is no calendar gap", () => {
    const itinerary: Itinerary = {
      id: "01952f1a-0000-7000-8000-000000000i06",
      days: [
        { dayNumber: 1, date: "2026-07-01", startPointId: null, points: [] },
        { dayNumber: 2, date: "2026-07-02", startPointId: null, points: [] },
      ],
    }
    render(
      <ItineraryTab tripId={TRIP_ID} itinerary={itinerary} isLeader={false} tripName="Test trip" />,
    )
    expect(screen.queryByTestId("rest-gap-entry")).not.toBeInTheDocument()
  })
})
