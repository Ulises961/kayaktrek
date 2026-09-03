import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import PrivacyPage from "../page"

// These assertions are deliberately about the claims Play reviews the policy against, and the
// ones a user relies on. A wording tweak that keeps the meaning should keep these passing; a
// change that removes the claim should fail, because removing it is a substantive change.
describe("PrivacyPage", () => {
  // The claim has to match crypto_service.py: PBKDF2 from the user's password, performed
  // server-side. Asserting the limit is stated, not just the protection, because overclaiming
  // here is the failure that matters — a user discloses more than they would have.
  it("states the encryption protects the stored data", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/cannot be read without that password/i)).toBeInTheDocument()
  })

  // M22 (2026-09) moved this crypto client-side, making the E2E claim true — this test used
  // to assert the opposite (that the page correctly disclaimed E2E) for the same reason it now
  // asserts the claim: removing either statement, in either direction, is the substantive
  // change this file exists to catch.
  it("states plainly that this is end-to-end encryption performed on the user's device", () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/this is end-to-end encryption/i)).toBeInTheDocument()
    expect(screen.getByText(/encryption and decryption happen on your device/i)).toBeInTheDocument()
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
