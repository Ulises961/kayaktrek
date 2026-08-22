import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { container, useMap } = vi.hoisted(() => {
  const container = document.createElement("div")
  return { container, useMap: vi.fn() }
})
vi.mock("react-leaflet", () => ({ useMap }))

import { MapCredits } from "../map-credits"

beforeEach(() => {
  // Attached, or `focus()` is a no-op and the keyboard assertions test nothing.
  document.body.appendChild(container)
  container.className = ""
  container.innerHTML = '&copy; <a href="https://example.org/copyright">OpenStreetMap</a>'
  useMap.mockReturnValue({ attributionControl: { getContainer: () => container } })
})

describe("MapCredits", () => {
  it("makes Leaflet's credit line a labelled, operable control", () => {
    render(<MapCredits />)
    expect(container.classList.contains("credits-collapsible")).toBe(true)
    expect(container.getAttribute("role")).toBe("button")
    expect(container.getAttribute("tabindex")).toBe("0")
    expect(container.getAttribute("aria-label")).toBe("Map credits")
    expect(container.getAttribute("aria-expanded")).toBe("false")
  })

  it("opens and closes on a tap", async () => {
    const user = userEvent.setup()
    render(<MapCredits />)

    await user.click(container)
    expect(container.classList.contains("credits-open")).toBe(true)
    expect(container.getAttribute("aria-expanded")).toBe("true")

    await user.click(container)
    expect(container.classList.contains("credits-open")).toBe(false)
    expect(container.getAttribute("aria-expanded")).toBe("false")
  })

  it("lets a tap on a credit link through instead of toggling", async () => {
    const user = userEvent.setup()
    render(<MapCredits />)
    await user.click(container) // open it, so the links are showing
    expect(container.classList.contains("credits-open")).toBe(true)

    // The licences are the reason this control exists — reaching them must not
    // be intercepted by the collapse toggle.
    const link = container.querySelector("a")!
    await user.click(link)
    expect(container.classList.contains("credits-open")).toBe(true)
  })

  it("closes when the next tap lands anywhere else", async () => {
    const user = userEvent.setup()
    render(<MapCredits />)
    await user.click(container)
    expect(container.classList.contains("credits-open")).toBe(true)

    // Opened, the line is wall-to-wall links — its own centre is the
    // OpenStreetMap link — so tapping it again is not a way back.
    await user.click(document.body)
    expect(container.classList.contains("credits-open")).toBe(false)
  })

  it("closes on Escape and toggles on Enter, so it is not pointer-only", async () => {
    const user = userEvent.setup()
    render(<MapCredits />)
    container.focus()

    await user.keyboard("{Enter}")
    expect(container.classList.contains("credits-open")).toBe(true)
    await user.keyboard("{Escape}")
    expect(container.classList.contains("credits-open")).toBe(false)
  })

  it("leaves Leaflet's element as it found it on unmount", () => {
    const { unmount } = render(<MapCredits />)
    unmount()
    expect(container.className).toBe("")
    expect(container.getAttribute("role")).toBeNull()
    expect(container.getAttribute("tabindex")).toBeNull()
    expect(container.getAttribute("aria-expanded")).toBeNull()
  })

  it("does nothing when the map has no attribution control", () => {
    useMap.mockReturnValue({})
    expect(() => render(<MapCredits />)).not.toThrow()
  })
})
