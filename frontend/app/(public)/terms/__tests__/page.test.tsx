import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import TermsPage from "../page"

describe("TermsPage", () => {
  it("renders the safety disclaimer", () => {
    render(<TermsPage />)
    expect(screen.getByText(/planning aid only/i)).toBeInTheDocument()
  })

  it("states user-generated content is not verified", () => {
    render(<TermsPage />)
    expect(screen.getByText(/do not review, verify, or vouch/i)).toBeInTheDocument()
  })

  it("links back to the app from the header", () => {
    render(<TermsPage />)
    expect(screen.getByRole("link", { name: /kayak expedition planner/i })).toHaveAttribute(
      "href",
      "/",
    )
  })
})
