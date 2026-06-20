import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SeaGrid } from "../sea-grid"
import type { SeaState } from "@/lib/dtos/sea"

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

  it("labels wind wave and swell sections", () => {
    render(<SeaGrid states={states} />)
    expect(screen.getAllByText("wv").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("sw").length).toBeGreaterThanOrEqual(1)
  })

  it("marks the card matching selectedHour as active", () => {
    const { container } = render(<SeaGrid states={states} selectedHour={9} />)
    const active = container.querySelectorAll("[data-active]")
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveTextContent("09:00")
  })
})
