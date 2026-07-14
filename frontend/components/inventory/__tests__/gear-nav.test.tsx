import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}))

import { GearNav } from "../gear-nav"

describe("GearNav", () => {
  it("links to both gear segments", () => {
    mockUsePathname.mockReturnValue("/gear")
    render(<GearNav />)
    expect(screen.getByRole("link", { name: /my kit/i }).getAttribute("href")).toBe("/gear")
    expect(screen.getByRole("link", { name: /default template/i }).getAttribute("href")).toBe(
      "/gear/templates",
    )
  })

  it("marks the active segment with aria-current", () => {
    mockUsePathname.mockReturnValue("/gear/templates")
    render(<GearNav />)
    expect(
      screen.getByRole("link", { name: /default template/i }).getAttribute("aria-current"),
    ).toBe("page")
    expect(screen.getByRole("link", { name: /my kit/i }).getAttribute("aria-current")).toBeNull()
  })
})
