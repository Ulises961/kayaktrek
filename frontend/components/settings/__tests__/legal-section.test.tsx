import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LegalSection } from "../legal-section"

describe("LegalSection", () => {
  it("links to the Terms of Use", () => {
    render(<LegalSection />)
    expect(screen.getByRole("link", { name: /terms of use/i })).toHaveAttribute("href", "/terms")
  })

  it("links to the Privacy Policy", () => {
    render(<LegalSection />)
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute(
      "href",
      "/privacy",
    )
  })

  it("links to the contact address", () => {
    render(<LegalSection />)
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute(
      "href",
      "mailto:privacy@kayaktrek.app",
    )
  })
})
