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
    expect(screen.getByRole("link", { name: /kayaktrek/i })).toHaveAttribute("href", "/")
  })

  it("points contact questions at the About page", () => {
    render(<TermsPage />)
    expect(screen.getByRole("link", { name: /about page/i })).toHaveAttribute("href", "/about")
  })

  it("states the Service is not an emergency service", () => {
    render(<TermsPage />)
    expect(screen.getByText(/not an emergency service/i)).toBeInTheDocument()
    expect(screen.getByText(/do not contact search-and-rescue/i)).toBeInTheDocument()
  })

  it("states a minimum age for creating an account", () => {
    render(<TermsPage />)
    expect(screen.getByText(/at least 18 years old/i)).toBeInTheDocument()
  })

  it("requires authority to use the Service on behalf of an organization", () => {
    render(<TermsPage />)
    expect(screen.getByText(/paddling club, expedition company/i)).toBeInTheDocument()
  })

  it("prohibits scraping, reverse engineering, and building a competing product", () => {
    render(<TermsPage />)
    expect(screen.getByText(/scrape, crawl, or bulk-extract/i)).toBeInTheDocument()
    expect(screen.getByText(/decompile, reverse engineer/i)).toBeInTheDocument()
    expect(screen.getByText(/directly competes with the service/i)).toBeInTheDocument()
  })

  it("prohibits impersonation and sharing account credentials", () => {
    render(<TermsPage />)
    expect(screen.getByText(/impersonate someone else/i)).toBeInTheDocument()
    expect(screen.getByText(/don.t share your account credentials/i)).toBeInTheDocument()
  })

  it("holds users responsible for the accuracy of safety-related data they enter", () => {
    render(<TermsPage />)
    expect(
      screen.getByText(/responsible for the accuracy of information you enter/i),
    ).toBeInTheDocument()
  })

  it("grants an explicit, limited right to use the Service", () => {
    render(<TermsPage />)
    expect(
      screen.getByText(/non-exclusive, non-transferable, revocable right/i),
    ).toBeInTheDocument()
  })

  it("reserves the right to discontinue the Service and points at data export", () => {
    render(<TermsPage />)
    expect(screen.getByText(/discontinue it entirely/i)).toBeInTheDocument()
  })

  it("promises advance notice for a material change to these Terms", () => {
    render(<TermsPage />)
    expect(screen.getByText(/for a material change.*advance notice/i)).toBeInTheDocument()
  })

  it("carries a visible last-updated date", () => {
    render(<TermsPage />)
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
  })
})
