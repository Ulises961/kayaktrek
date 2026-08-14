import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ActiveExpeditionCard } from "../active-expedition-card"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { expeditionProgress } from "@/lib/trips/progress"
import { formatDateRange } from "@/lib/trips/format"
import { liveMapHref } from "@/lib/trips/live"

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// RouteThumbnail renders a Leaflet map, which jsdom cannot mount. Stubbed to a marker so
// the assertions below are about whether the card *keeps the chart*, not about Leaflet.
vi.mock("@/components/common/route-thumbnail", () => ({
  RouteThumbnail: () => <div data-testid="route-thumbnail" />,
}))

const ROUTE = { positions: [[68.1, 13.6] as [number, number]] } as never

const ITINERARY_ID = "019f7ef9-0000-7000-8000-00000000e001"
const DATE_FROM = "2026-07-01"
const DATE_TO = "2026-07-05"

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "019f7ef9-9c12-7cbc-95fe-7bfb29645b23",
    destination: "Lofoten Archipelago",
    state: TRIP_STATE.HAPPENING,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    ...overrides,
  } as Trip
}

/** A day carrying the hourly weather/sea rows the conditions grid reads. */
function dayWith(weatherSea: { windForce?: number; windDirection?: number; swell?: number }) {
  return {
    id: "019f7ef9-0000-7000-8000-00000000d001",
    dayNumber: 1,
    weather: {
      dayId: "019f7ef9-0000-7000-8000-00000000d001",
      weatherStates:
        weatherSea.windForce == null
          ? []
          : [
              {
                dayId: "019f7ef9-0000-7000-8000-00000000d001",
                time: "09:00",
                windForce: weatherSea.windForce,
                windDirection: weatherSea.windDirection,
              },
            ],
    },
    sea: {
      dayId: "019f7ef9-0000-7000-8000-00000000d001",
      seaStates:
        weatherSea.swell == null
          ? []
          : [
              {
                waveHeight: 1,
                waveDirection: 300,
                swellWaveHeight: weatherSea.swell,
                swellPeriod: 7,
              },
            ],
    },
    points: [],
  }
}

describe("ActiveExpeditionCard", () => {
  it("shows which day of the expedition the paddler is on", () => {
    render(<ActiveExpeditionCard trip={makeTrip()} route={null} />)

    // Derived from the helper rather than hand-typed, so a convention change to the
    // progress maths updates this assertion with it.
    const progress = expeditionProgress(DATE_FROM, DATE_TO)!
    expect(
      screen.getByText(`Day ${progress.dayNumber} of ${progress.totalDays}`),
    ).toBeInTheDocument()
    expect(screen.getByText(`${progress.percent}%`)).toBeInTheDocument()
  })

  it("sizes the progress bar to the percentage it reports", () => {
    // The bar is the whole point of the panel — asserting only the text would let it
    // render a full bar on day 1 and still pass.
    render(<ActiveExpeditionCard trip={makeTrip()} route={null} />)

    const progress = expeditionProgress(DATE_FROM, DATE_TO)!
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuenow", String(progress.percent))
    expect(bar.firstElementChild).toHaveStyle({ width: `${progress.percent}%` })
  })

  it("omits the progress bar entirely when the trip has no dates", () => {
    render(<ActiveExpeditionCard trip={makeTrip({ dateFrom: null, dateTo: null })} route={null} />)

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    // The card must still render — this is the surface used mid-expedition.
    expect(screen.getByText("Lofoten Archipelago")).toBeInTheDocument()
  })

  it("sends Live tracking to the live map, not the trip's plan", () => {
    const trip = makeTrip({ itinerary: { id: ITINERARY_ID } } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    // Through the shared helper, so this and the trip's own Live tab cannot drift apart.
    expect(screen.getByRole("link", { name: /live tracking/i })).toHaveAttribute(
      "href",
      liveMapHref(trip),
    )
  })

  it("omits Live tracking entirely when there is no itinerary to navigate", () => {
    // A button to /itinerary/undefined is a 404 dressed as a working control.
    render(<ActiveExpeditionCard trip={makeTrip()} route={null} />)

    expect(screen.queryByRole("link", { name: /live tracking/i })).not.toBeInTheDocument()
  })

  it("shows the day's wind and swell when the forecast has them", () => {
    const trip = makeTrip({
      itinerary: { days: [dayWith({ windForce: 12, windDirection: 315, swell: 0.8 })] },
    } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    expect(screen.getByText("12 kn NW")).toBeInTheDocument()
    expect(screen.getByText("0.8 m · 7 s")).toBeInTheDocument()
  })

  it("shows no conditions grid rather than empty cells when there is no forecast", () => {
    const trip = makeTrip({ itinerary: { days: [dayWith({})] } } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    expect(screen.queryByText("Wind")).not.toBeInTheDocument()
    expect(screen.queryByText("Swell")).not.toBeInTheDocument()
  })

  it("counts the crew and renders an avatar for each", () => {
    const trip = makeTrip({
      travellers: [
        { id: "m1", user: { id: "u1", name: "Ada", surname: "Byron" } },
        { id: "m2", user: { id: "u2", name: "Grace", surname: "Hopper" } },
      ],
    } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    expect(screen.getByText("2 crew")).toBeInTheDocument()
    expect(screen.getByText("AB")).toBeInTheDocument()
    expect(screen.getByText("GH")).toBeInTheDocument()
  })

  // The panel replaced the plan card for `happening` trips, so it has to carry that
  // card's affordances too — losing them is a regression the day a trip goes live.
  it("keeps the route thumbnail, linked to the trip", () => {
    render(<ActiveExpeditionCard trip={makeTrip()} route={ROUTE} />)

    expect(screen.getByTestId("route-thumbnail")).toBeInTheDocument()
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(links).toContain("/trips/019f7ef9-9c12-7cbc-95fe-7bfb29645b23")
  })

  it("shows the planned dates, not only the day counter", () => {
    render(<ActiveExpeditionCard trip={makeTrip()} route={null} />)

    // Through the canonical formatter, so a change to date conventions updates this too.
    expect(screen.getByText(formatDateRange(DATE_FROM, DATE_TO))).toBeInTheDocument()
  })

  it("offers the itinerary when there is one but no plotted route yet", () => {
    const trip = makeTrip({
      itinerary: { id: "019f7ef9-0000-7000-8000-00000000e001" },
    } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    expect(screen.getByRole("link", { name: /itinerary ready/i })).toHaveAttribute(
      "href",
      "/trips/019f7ef9-9c12-7cbc-95fe-7bfb29645b23",
    )
  })

  it("does not offer the itinerary hint when the chart is already showing", () => {
    const trip = makeTrip({
      itinerary: { id: "019f7ef9-0000-7000-8000-00000000e001" },
    } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={ROUTE} />)

    expect(screen.queryByText(/itinerary ready/i)).not.toBeInTheDocument()
  })

  it("says 'paddler' rather than 'crew' for a solo trip", () => {
    const trip = makeTrip({
      travellers: [{ id: "m1", user: { id: "u1", name: "Ada", surname: "Byron" } }],
    } as Partial<Trip>)

    render(<ActiveExpeditionCard trip={trip} route={null} />)

    expect(screen.getByText("1 paddler")).toBeInTheDocument()
  })
})
