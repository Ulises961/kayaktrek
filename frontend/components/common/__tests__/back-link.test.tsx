import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BackLink } from "../back-link"

describe("BackLink", () => {
  it("renders a link with the given href and label", () => {
    render(<BackLink href="/trips/1" label="Back to trip" />)
    const link = screen.getByRole("link", { name: "Back to trip" })
    expect(link).toHaveAttribute("href", "/trips/1")
  })

  it("defaults to the inline variant", () => {
    render(<BackLink href="/" label="Home" />)
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("text-muted-foreground")
  })

  it("uses legible-over-map styling for the floating variant, with no pill/FAB chrome", () => {
    render(<BackLink href="/" label="Home" variant="floating" />)
    const link = screen.getByRole("link", { name: "Home" })
    expect(link).not.toHaveClass("rounded-full", "bg-white/90", "shadow-lg", "border")
  })

  it("merges a caller-provided className", () => {
    render(<BackLink href="/" label="Home" className="absolute top-6 left-6" />)
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("absolute", "top-6", "left-6")
  })

  it("sizes down for the xs (compact document header) size", () => {
    render(<BackLink href="/" label="Home" size="xs" />)
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("text-xs")
  })
})
