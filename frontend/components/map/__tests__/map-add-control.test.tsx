import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MapAddControl } from "../map-add-control"

const BASE = {
  canAddPlace: true,
  canAddDiamond: true,
  canAddWindDiamond: true,
  placingMode: null,
  onStartPlace: vi.fn(),
  onStartDiamond: vi.fn(),
  onStartWindDiamond: vi.fn(),
  onCancel: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe("MapAddControl", () => {
  it("renders the Add disclosure button", () => {
    render(<MapAddControl {...BASE} />)
    expect(screen.getByTestId("add-button")).toBeInTheDocument()
  })

  it("keeps the panel hidden until the Add button is clicked", () => {
    render(<MapAddControl {...BASE} />)
    expect(screen.getByTestId("add-panel")).not.toBeVisible()
    fireEvent.click(screen.getByTestId("add-button"))
    expect(screen.getByTestId("add-panel")).toBeVisible()
  })

  it("offers Place and Tidal diamond items when both are available", () => {
    render(<MapAddControl {...BASE} />)
    expect(screen.getByTestId("add-place-button")).toBeInTheDocument()
    expect(screen.getByTestId("add-diamond-button")).toBeInTheDocument()
  })

  it("shows a one-line description under each item", () => {
    render(<MapAddControl {...BASE} />)
    expect(screen.getByText(/point of interest/i)).toBeInTheDocument()
    expect(screen.getByText(/manual tide entry/i)).toBeInTheDocument()
  })

  it("shows a click-the-map hint for route points in the disclosure", () => {
    render(<MapAddControl {...BASE} />)
    fireEvent.click(screen.getByTestId("add-button"))
    expect(screen.getByText(/route points: click the map/i)).toBeInTheDocument()
  })

  it("disables the diamond item with a reason when a day is not selected, instead of hiding it", () => {
    render(<MapAddControl {...BASE} canAddDiamond={false} />)
    expect(screen.getByTestId("add-place-button")).toBeInTheDocument()
    const diamondButton = screen.getByTestId("add-diamond-button")
    expect(diamondButton).toBeInTheDocument()
    expect(diamondButton).toBeDisabled()
    expect(screen.getByText(/select a day first/i)).toBeInTheDocument()
  })

  it("clicking the disabled diamond item does not start placement", () => {
    const onStartDiamond = vi.fn()
    render(<MapAddControl {...BASE} canAddDiamond={false} onStartDiamond={onStartDiamond} />)
    fireEvent.click(screen.getByTestId("add-diamond-button"))
    expect(onStartDiamond).not.toHaveBeenCalled()
  })

  it("disables the place item (never hidden) when places cannot be managed", () => {
    render(<MapAddControl {...BASE} canAddPlace={false} />)
    expect(screen.getByTestId("add-place-button")).toBeDisabled()
    expect(screen.getByTestId("add-diamond-button")).not.toBeDisabled()
  })

  it("starts place placement and closes the menu when Place is clicked", () => {
    const onStartPlace = vi.fn()
    render(<MapAddControl {...BASE} onStartPlace={onStartPlace} />)
    fireEvent.click(screen.getByTestId("add-button"))
    fireEvent.click(screen.getByTestId("add-place-button"))
    expect(onStartPlace).toHaveBeenCalledOnce()
    expect(screen.getByTestId("add-panel")).not.toBeVisible()
  })

  it("collapses to a click-the-map prompt while placing, with a working Cancel", () => {
    const onCancel = vi.fn()
    render(<MapAddControl {...BASE} placingMode="place" onCancel={onCancel} />)
    expect(screen.queryByTestId("add-button")).not.toBeInTheDocument()
    expect(screen.getByText(/click the map to place the spot/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("shows the diamond prompt wording while placing a diamond", () => {
    render(<MapAddControl {...BASE} placingMode="diamond" />)
    expect(screen.getByText(/click the map to place the diamond/i)).toBeInTheDocument()
  })

  it("offers a Wind diamond item alongside Place and Tidal diamond", () => {
    render(<MapAddControl {...BASE} />)
    expect(screen.getByTestId("add-wind-diamond-button")).toBeInTheDocument()
  })

  it("disables the wind-diamond item when it cannot be added", () => {
    render(<MapAddControl {...BASE} canAddWindDiamond={false} />)
    expect(screen.getByTestId("add-wind-diamond-button")).toBeDisabled()
  })

  it("starts wind-diamond placement and closes the menu when Wind diamond is clicked", () => {
    const onStartWindDiamond = vi.fn()
    render(<MapAddControl {...BASE} onStartWindDiamond={onStartWindDiamond} />)
    fireEvent.click(screen.getByTestId("add-button"))
    fireEvent.click(screen.getByTestId("add-wind-diamond-button"))
    expect(onStartWindDiamond).toHaveBeenCalledOnce()
    expect(screen.getByTestId("add-panel")).not.toBeVisible()
  })

  it("shows the wind-diamond prompt wording while placing one", () => {
    render(<MapAddControl {...BASE} placingMode="wind" />)
    expect(screen.getByText(/click the map to place the wind diamond/i)).toBeInTheDocument()
  })
})
