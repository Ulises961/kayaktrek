import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { LayersControl } from "../layers-control"

const BASE_PROPS = {
  windEnabled: true,
  swellEnabled: true,
  diamondsEnabled: true,
  hasDiamonds: false,
  onWindToggle: vi.fn(),
  onSwellToggle: vi.fn(),
  onDiamondsToggle: vi.fn(),
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

  it("hides the wind speed legend when windEnabled is false", () => {
    render(<LayersControl {...BASE_PROPS} windEnabled={false} />)
    expect(screen.queryByTestId("wind-legend")).not.toBeInTheDocument()
  })
})
