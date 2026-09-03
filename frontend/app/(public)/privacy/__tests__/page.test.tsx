import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import PrivacyPage from "../page"

// These assertions are deliberately about the claims Play reviews the policy against, and the
// ones a user relies on. A wording tweak that keeps the meaning should keep these passing; a
// change that removes the claim should fail, because removing it is a substantive change.
describe("PrivacyPage", () => {
  // This assertion has now been inverted twice, and the reason is the same each time: the
  // page must state whatever is currently true about health data, and a change in either
  // direction is substantive. It first asserted the policy correctly *disclaimed* E2E; M22
  // (2026-09-01) moved the crypto client-side and it asserted the E2E claim; parking the
  // feature (2026-09-02) means the app collects no health data at all, so that is the claim
  // now. If medical notes are unparked, the E2E section comes back and so does its assertion
  // — but a stale "we encrypt your health data" on a page for an app that never asks for any
  // is the failure this test exists to catch, and it is worse than the overclaim was.
  it("states that no health data is collected", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/does not collect health data/i)).toBeInTheDocument()
    expect(screen.getByText(/holds no such information about you/i)).toBeInTheDocument()
  })

  it("does not describe collecting or encrypting medical information", () => {
    const { container } = render(<PrivacyPage />)
    expect(container.textContent).not.toMatch(/end-to-end encryption/i)
    expect(container.textContent).not.toMatch(/special category data/i)
  })

  it("states that position sharing is off unless turned on", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/disabled by default/i)).toBeInTheDocument()
  })

  // Stated twice on purpose — once where location sharing is explained, once in the retention
  // list — so asserting the count catches removal from either place.
  it("gives the retention window for recorded positions in both places", () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/30 days after the trip ends/i)).toHaveLength(2)
  })

  it("tells a user who cannot sign in how to get their account deleted", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/unable to sign in, or have uninstalled/i)).toBeInTheDocument()
  })

  // Categories rather than vendor names: GDPR Art. 13(1)(e) accepts either, and a named list
  // goes stale silently the day a provider is swapped. Asserting the categories keeps the
  // disclosure honest without pinning the test to procurement decisions.
  it("discloses the categories of recipient", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/infrastructure and application hosting/i)).toBeInTheDocument()
    expect(screen.getByText(/transactional email delivery/i)).toBeInTheDocument()
    expect(screen.getByText(/encrypted off-site backup storage/i)).toBeInTheDocument()
  })

  it("offers the processor identities on request, since they are not listed", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/available on request/i)).toBeInTheDocument()
  })

  it("states that data is not sold and no tracking is used", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/we do not sell personal data/i)).toBeInTheDocument()
    expect(
      screen.getByText(/does not use advertising, analytics, or tracking cookies/i),
    ).toBeInTheDocument()
  })

  it("links back to the app from the header", () => {
    render(<PrivacyPage />)
    // The link's accessible name also carries ChartHeaderBar's subtitle ("Sea-kayak
    // expedition planner") — visually hidden below `sm` via CSS, but jsdom applies no
    // stylesheet, so `hidden` never actually removes it from the render. A prefix match
    // is the correct assertion in both environments: a real browser at `sm`+ shows the
    // subtitle too, so it belongs in the link's name there as well.
    expect(screen.getByRole("link", { name: /^kayaktrek/i })).toHaveAttribute("href", "/")
  })

  it("makes the contact address a mailto link", () => {
    render(<PrivacyPage />)
    const links = screen.getAllByRole("link", { name: "privacy@kayaktrek.app" })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute("href", "mailto:privacy@kayaktrek.app")
    }
  })
})
