import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MileageSummary } from "../mileage-summary"

let store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { store = {} },
}

beforeEach(() => {
  store = {}
  vi.stubGlobal("localStorage", localStorageMock)
})

describe("MileageSummary", () => {
  it("shows placeholder when both values are null", () => {
    render(<MileageSummary planned={null} actual={null} />)
    expect(screen.getByText(/no distance/i)).toBeTruthy()
  })

  it("renders planned distance in km by default", () => {
    render(<MileageSummary planned={100} actual={null} />)
    expect(screen.getByText("100.0 km")).toBeTruthy()
  })

  it("renders actual distance when provided", () => {
    render(<MileageSummary planned={100} actual={85} />)
    expect(screen.getByText("85.0 km")).toBeTruthy()
  })

  it("converts to nautical miles on toggle", () => {
    render(<MileageSummary planned={100} actual={null} />)
    fireEvent.click(screen.getByRole("button", { name: /nm/i }))
    expect(screen.getByText("54.0 nm")).toBeTruthy()
  })

  it("persists unit preference to localStorage", () => {
    render(<MileageSummary planned={100} actual={null} />)
    fireEvent.click(screen.getByRole("button", { name: /nm/i }))
    expect(localStorageMock.getItem("distanceUnit")).toBe("nm")
  })

  it("reads unit preference from localStorage on mount", () => {
    localStorageMock.setItem("distanceUnit", "nm")
    render(<MileageSummary planned={100} actual={null} />)
    expect(screen.getByText("54.0 nm")).toBeTruthy()
  })
})
