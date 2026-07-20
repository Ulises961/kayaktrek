import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}))

import { ItemsNav } from "../items-nav"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("ItemsNav", () => {
  it("links to both sub-segments for a member", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}/items`)
    render(<ItemsNav tripId={TRIP_ID} showKit />)
    expect(screen.getByRole("link", { name: /group requirements/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/items`,
    )
    expect(screen.getByRole("link", { name: /my kit/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/items/kit`,
    )
  })

  it("marks the active sub-segment with aria-current", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}/items/kit`)
    render(<ItemsNav tripId={TRIP_ID} showKit />)
    expect(screen.getByRole("link", { name: /my kit/i }).getAttribute("aria-current")).toBe("page")
    expect(
      screen.getByRole("link", { name: /group requirements/i }).getAttribute("aria-current"),
    ).toBeNull()
  })

  it("renders nothing for a non-member — one segment needs no nav", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}/items`)
    const { container } = render(<ItemsNav tripId={TRIP_ID} showKit={false} />)
    expect(container.firstChild).toBeNull()
  })
})
