import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrandLockup } from "../brand-lockup"

describe("BrandLockup", () => {
  it("links to the landing page by default", () => {
    render(<BrandLockup />)
    expect(screen.getByRole("link", { name: /kayaktrek/i })).toHaveAttribute("href", "/")
  })

  it("links wherever the caller points it", () => {
    render(<BrandLockup href="/dashboard" />)
    expect(screen.getByRole("link", { name: /kayaktrek/i })).toHaveAttribute("href", "/dashboard")
  })

  it("keeps the wordmark in the accessible name even when it is visually hidden", () => {
    // The app shell hides the wordmark below md to save header width. The link
    // must still name itself — the mark alone is aria-hidden decoration.
    render(<BrandLockup wordmarkClassName="hidden md:inline" />)
    expect(screen.getByRole("link", { name: /kayaktrek/i })).toBeInTheDocument()
  })

  it("renders no subtitle unless the caller opts in", () => {
    render(<BrandLockup />)
    expect(screen.queryByText(/expedition planner/i)).not.toBeInTheDocument()
  })

  it("renders the subtitle when the caller passes one", () => {
    render(<BrandLockup subtitle="Sea-kayak expedition planner" />)
    expect(screen.getByText(/sea-kayak expedition planner/i)).toBeInTheDocument()
  })
})
