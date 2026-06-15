import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { LayersControl } from "../layers-control"

const BASE_PROPS = {
  windEnabled: true,
  swellEnabled: true,
  tidalEnabled: true,
  hasTidalLayer: false,
  tidalSource: null,
  onWindToggle: vi.fn(),
  onSwellToggle: vi.fn(),
  onTidalToggle: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe("LayersControl", () => {
  it("renders the velocity-controls container", () => {
    render(<LayersControl {...BASE_PROPS} />)
    expect(screen.getByTestId("velocity-controls")).toBeInTheDocument()
  })

  it("wind-toggle and swell-toggle are in the DOM even when panel is closed", () => {
    render(<LayersControl {...BASE_PROPS} />)
    expect(screen.getByTestId("wind-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("swell-toggle")).toBeInTheDocument()
  })

  it("opens the panel when the layers button is clicked", () => {
    render(<LayersControl {...BASE_PROPS} />)
    expect(screen.getByTestId("layers-panel")).not.toBeVisible()
    fireEvent.click(screen.getByTestId("layers-button"))
    expect(screen.getByTestId("layers-panel")).toBeVisible()
  })

  it("closes the panel on a second click", () => {
    render(<LayersControl {...BASE_PROPS} />)
    fireEvent.click(screen.getByTestId("layers-button"))
    fireEvent.click(screen.getByTestId("layers-button"))
    expect(screen.getByTestId("layers-panel")).not.toBeVisible()
  })

  it("calls onWindToggle when wind-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} />)
    fireEvent.click(screen.getByTestId("wind-toggle"))
    expect(BASE_PROPS.onWindToggle).toHaveBeenCalledOnce()
  })

  it("calls onSwellToggle when swell-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} />)
    fireEvent.click(screen.getByTestId("swell-toggle"))
    expect(BASE_PROPS.onSwellToggle).toHaveBeenCalledOnce()
  })

  it("does not render tidal-toggle when hasTidalLayer is false", () => {
    render(<LayersControl {...BASE_PROPS} hasTidalLayer={false} />)
    expect(screen.queryByTestId("tidal-toggle")).not.toBeInTheDocument()
  })

  it("renders tidal-toggle containing 'atlas' when source is station", () => {
    render(<LayersControl {...BASE_PROPS} hasTidalLayer tidalSource="station" />)
    expect(screen.getByTestId("tidal-toggle")).toHaveTextContent("atlas")
  })

  it("renders tidal-toggle containing 'manual' when source is manual", () => {
    render(<LayersControl {...BASE_PROPS} hasTidalLayer tidalSource="manual" />)
    expect(screen.getByTestId("tidal-toggle")).toHaveTextContent("manual")
  })

  it("calls onTidalToggle when tidal-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} hasTidalLayer tidalSource="station" />)
    fireEvent.click(screen.getByTestId("tidal-toggle"))
    expect(BASE_PROPS.onTidalToggle).toHaveBeenCalledOnce()
  })

  it("reflects windEnabled=false with aria-checked false on wind-toggle", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={false} />)
    expect(screen.getByTestId("wind-toggle")).toHaveAttribute("aria-checked", "false")
  })

  it("reflects windEnabled=true with aria-checked true on wind-toggle", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={true} />)
    expect(screen.getByTestId("wind-toggle")).toHaveAttribute("aria-checked", "true")
  })

  it("shows the wind speed legend in the panel when windEnabled is true", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={true} />)
    expect(screen.getByTestId("wind-legend")).toBeInTheDocument()
  })

  it("hides the wind speed legend when windEnabled is false", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={false} />)
    expect(screen.queryByTestId("wind-legend")).not.toBeInTheDocument()
  })
})
