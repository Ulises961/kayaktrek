import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SeaGrid } from "../sea-grid"
import type { SeaState } from "@/lib/dtos/sea"

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({
    children,
    "data-testid": testid,
  }: {
    children: React.ReactNode
    "data-testid"?: string
  }) => <div data-testid={testid}>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const DAY_ID = "01900000-0000-7000-8000-000000000001"

const states: SeaState[] = [
  {
    dayId: DAY_ID,
    time: "09:00:00",
    waveHeight: 1.2,
    waveDirection: 270,
    swellDirection: 280,
    swellPeriod: 8,
  },
  {
    dayId: DAY_ID,
    time: "12:00:00",
    waveHeight: 2.8,
    waveDirection: 260,
    swellDirection: 285,
    swellPeriod: 11,
  },
]

describe("SeaGrid", () => {
  it("renders nothing when there are no states", () => {
    const { container } = render(<SeaGrid states={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders wave height and swell period per hour", () => {
    render(<SeaGrid states={states} />)
    expect(screen.getByText("09:00")).toBeInTheDocument()
    expect(screen.getByText("1.2 m")).toBeInTheDocument()
    expect(screen.getByText("8 s")).toBeInTheDocument()
    expect(screen.getByText("2.8 m")).toBeInTheDocument()
    expect(screen.getByText("11 s")).toBeInTheDocument()
  })

  it("colours wave height by WMO severity", () => {
    render(<SeaGrid states={states} />)
    expect(screen.getByText("1.2 m").className).toContain("text-amber-700") // moderate
    expect(screen.getByText("2.8 m").className).toContain("text-red-700") // high
  })

  it("renders a dash, not a number, for an hour with no wave data when other hours have it", () => {
    const partial: SeaState[] = [
      { dayId: DAY_ID, time: "09:00:00", waveHeight: null, waveDirection: null },
      { dayId: DAY_ID, time: "12:00:00", waveHeight: 1.2, waveDirection: 270 },
    ]
    render(<SeaGrid states={partial} />)
    expect(screen.getByText("09:00")).toBeInTheDocument()
    expect(screen.getByText("1.2 m")).toBeInTheDocument()
    expect(screen.getByTestId("wave-height-missing")).toHaveTextContent("—")
    expect(screen.queryByText(/no wave forecast/i)).not.toBeInTheDocument()
  })

  it("says there is no wave forecast, instead of a row of dashes, when no hour has any", () => {
    const lake: SeaState[] = ["09:00:00", "12:00:00", "15:00:00"].map((time) => ({
      dayId: DAY_ID,
      time,
      waveHeight: null,
      waveDirection: null,
    }))
    render(<SeaGrid states={lake} />)
    expect(screen.getByText("Sea & swell")).toBeInTheDocument()
    expect(screen.getByText(/no wave forecast for this area/i)).toBeInTheDocument()
    expect(screen.queryByTestId("sea-grid")).not.toBeInTheDocument()
    expect(screen.queryByTestId("wave-height-missing")).not.toBeInTheDocument()
  })

  it("labels wind wave and swell sections", () => {
    render(<SeaGrid states={states} />)
    expect(screen.getAllByText("wv").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("sw").length).toBeGreaterThanOrEqual(1)
  })
})
