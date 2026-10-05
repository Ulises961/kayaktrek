import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { windLegendLabels } from "@/lib/weather/wind-scale"
import { LayersControl } from "../layers-control"

const BASE_PROPS = {
  windEnabled: true,
  swellEnabled: true,
  diamondsEnabled: true,
  hasDiamonds: false,
  windDiamondsEnabled: true,
  hasWindDiamonds: false,
  placesEnabled: true,
  hasPlaces: false,
  showConditions: true,
  onWindToggle: vi.fn(),
  onSwellToggle: vi.fn(),
  onDiamondsToggle: vi.fn(),
  onWindDiamondsToggle: vi.fn(),
  onPlacesToggle: vi.fn(),
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

  it("does not render diamonds-toggle when hasDiamonds is false", () => {
    render(<LayersControl {...BASE_PROPS} hasDiamonds={false} />)
    expect(screen.queryByTestId("diamonds-toggle")).not.toBeInTheDocument()
  })

  it("renders the diamonds-toggle labelled 'Tidal diamonds' when diamonds exist", () => {
    render(<LayersControl {...BASE_PROPS} hasDiamonds />)
    expect(screen.getByTestId("diamonds-toggle")).toHaveTextContent("Tidal diamonds")
  })

  it("calls onDiamondsToggle when diamonds-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} hasDiamonds />)
    fireEvent.click(screen.getByTestId("diamonds-toggle"))
    expect(BASE_PROPS.onDiamondsToggle).toHaveBeenCalledOnce()
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

  it("labels the legend over the window the particles are coloured on", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={true} />)
    const legend = screen.getByTestId("wind-legend")

    for (const label of windLegendLabels()) {
      expect(within(legend).getByText(label)).toBeInTheDocument()
    }
  })

  it("draws the legend bar and the wind switch's swatch from the same colour scale", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={true} />)

    expect(screen.getByTestId("wind-legend-bar").getAttribute("style")).toContain("linear-gradient")
    expect(screen.getByTestId("wind-swatch").getAttribute("style")).toContain("linear-gradient")
  })

  it("hides the wind speed legend when windEnabled is false", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={false} />)
    expect(screen.queryByTestId("wind-legend")).not.toBeInTheDocument()
  })

  it("does not render places-toggle when hasPlaces is false", () => {
    render(<LayersControl {...BASE_PROPS} hasPlaces={false} />)
    expect(screen.queryByTestId("places-toggle")).not.toBeInTheDocument()
  })

  it("renders the places-toggle labelled 'Places' when places exist", () => {
    render(<LayersControl {...BASE_PROPS} hasPlaces />)
    expect(screen.getByTestId("places-toggle")).toHaveTextContent("Places")
  })

  it("calls onPlacesToggle when places-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} hasPlaces />)
    fireEvent.click(screen.getByTestId("places-toggle"))
    expect(BASE_PROPS.onPlacesToggle).toHaveBeenCalledOnce()
  })

  it("hides wind/swell toggles when showConditions is false but still shows places", () => {
    render(<LayersControl {...BASE_PROPS} showConditions={false} hasPlaces />)
    expect(screen.queryByTestId("wind-toggle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("swell-toggle")).not.toBeInTheDocument()
    expect(screen.getByTestId("places-toggle")).toBeInTheDocument()
  })

  it("does not render the wind-diamonds-toggle when hasWindDiamonds is false", () => {
    render(<LayersControl {...BASE_PROPS} hasWindDiamonds={false} />)
    expect(screen.queryByTestId("wind-diamonds-toggle")).not.toBeInTheDocument()
  })

  it("renders the wind-diamonds-toggle labelled 'Wind diamonds' when they exist", () => {
    render(<LayersControl {...BASE_PROPS} hasWindDiamonds />)
    expect(screen.getByTestId("wind-diamonds-toggle")).toHaveTextContent("Wind diamonds")
  })

  it("calls onWindDiamondsToggle when wind-diamonds-toggle is clicked", () => {
    render(<LayersControl {...BASE_PROPS} hasWindDiamonds />)
    fireEvent.click(screen.getByTestId("wind-diamonds-toggle"))
    expect(BASE_PROPS.onWindDiamondsToggle).toHaveBeenCalledOnce()
  })

  it("shows the wind-diamonds-toggle independent of showConditions (day-agnostic, like places)", () => {
    render(<LayersControl {...BASE_PROPS} showConditions={false} hasWindDiamonds />)
    expect(screen.getByTestId("wind-diamonds-toggle")).toBeInTheDocument()
  })
})
