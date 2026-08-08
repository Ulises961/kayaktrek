import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

vi.mock("leaflet", () => ({
  default: {
    divIcon: vi.fn((opts: Record<string, unknown>) => opts),
  },
}))

vi.mock("react-leaflet", () => ({
  Circle: () => <div data-testid="cell-ring" />,
  Marker: () => <div data-testid="cell-note" />,
  useMapEvents: vi.fn(() => ({ getZoom: () => 8 })),
}))

// A stand-in for the real VelocityLayer that reports which fields it was handed
// and — via a per-mount id — whether the shell kept the same instance alive or
// tore it down and built a fresh one.
let nextInstanceId = 0
vi.mock("@/components/weather/velocity-layer", () => ({
  VelocityLayer: ({ options }: { options: Record<string, unknown> }) => {
    const instance = React.useRef<number | null>(null)
    if (instance.current === null) instance.current = ++nextInstanceId
    const scale = (options.colorScale as string[])[0]
    return <div data-testid={`velocity-${scale}`} data-instance={instance.current} />
  },
}))

import { ForecastCellShell, type ForecastCellLayer } from "../forecast-cell"
import type { VelocityGridLayer } from "@/lib/types/ui"

const WIND_SCALE = ["#0d47a1", "#d50000"]
const SWELL_SCALE = ["#ffffff", "#e8f4fc"]

function grid(value: number): VelocityGridLayer[] {
  return [
    {
      header: {
        parameterUnit: "m/s",
        parameterCategory: 2,
        parameterNumber: 2,
        parameterNumberName: "eastward_wind",
        la1: 51,
        la2: 50,
        lo1: -5,
        lo2: -4,
        nx: 2,
        ny: 2,
        dx: 0.5,
        dy: 0.5,
      },
      data: [value, value, value, value],
    },
  ]
}

const WIND: ForecastCellLayer = {
  key: "wind",
  grid: grid(1),
  options: { colorScale: WIND_SCALE },
}
const SWELL: ForecastCellLayer = {
  key: "swell",
  grid: grid(2),
  options: { colorScale: SWELL_SCALE },
}

const CENTER: [number, number] = [50.3, -4.1]

beforeEach(() => {
  nextInstanceId = 0
  vi.clearAllMocks()
})

describe("ForecastCellShell", () => {
  it("draws one ring and one note however many velocity fields it carries", () => {
    render(<ForecastCellShell layers={[WIND, SWELL]} center={CENTER} radiusKm={20} />)
    expect(screen.getAllByTestId("cell-ring")).toHaveLength(1)
    expect(screen.getAllByTestId("cell-note")).toHaveLength(1)
    expect(screen.getByTestId(`velocity-${WIND_SCALE[0]}`)).toBeInTheDocument()
    expect(screen.getByTestId(`velocity-${SWELL_SCALE[0]}`)).toBeInTheDocument()
  })

  it("keeps each field's options paired with its own grid when one is toggled off", () => {
    const { rerender } = render(
      <ForecastCellShell layers={[WIND, SWELL]} center={CENTER} radiusKm={20} />,
    )
    const swellInstance = screen
      .getByTestId(`velocity-${SWELL_SCALE[0]}`)
      .getAttribute("data-instance")

    // Wind off: the wind field goes, the swell field stays — and stays swell.
    rerender(<ForecastCellShell layers={[SWELL]} center={CENTER} radiusKm={20} />)
    expect(screen.queryByTestId(`velocity-${WIND_SCALE[0]}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`velocity-${SWELL_SCALE[0]}`)).toHaveAttribute(
      "data-instance",
      swellInstance,
    )

    // Wind back on: it returns painted in the wind scale, and the swell field it
    // sits next to was never rebuilt to make room for it.
    rerender(<ForecastCellShell layers={[WIND, SWELL]} center={CENTER} radiusKm={20} />)
    expect(screen.getByTestId(`velocity-${WIND_SCALE[0]}`)).toBeInTheDocument()
    expect(screen.getByTestId(`velocity-${SWELL_SCALE[0]}`)).toHaveAttribute(
      "data-instance",
      swellInstance,
    )
  })
})
