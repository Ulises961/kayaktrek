import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MapAddControl } from "../map-add-control"

const BASE = {
  canAddPlace: true,
  canAddDiamond: true,
  placingMode: null,
  onStartPlace: vi.fn(),
  onStartDiamond: vi.fn(),
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

  it("omits the diamond item when a day is not selected (canAddDiamond false)", () => {
    render(<MapAddControl {...BASE} canAddDiamond={false} />)
    expect(screen.getByTestId("add-place-button")).toBeInTheDocument()
    expect(screen.queryByTestId("add-diamond-button")).not.toBeInTheDocument()
  })

  it("omits the place item when places cannot be managed", () => {
    render(<MapAddControl {...BASE} canAddPlace={false} />)
    expect(screen.queryByTestId("add-place-button")).not.toBeInTheDocument()
    expect(screen.getByTestId("add-diamond-button")).toBeInTheDocument()
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
})
