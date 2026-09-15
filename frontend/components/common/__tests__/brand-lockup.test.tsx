import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrandLockup } from "../brand-lockup"

const forceNavigate = vi.fn()
vi.mock("@/lib/utils/navigation", () => ({
  forceNavigate: (href: string) => forceNavigate(href),
}))

describe("BrandLockup", () => {
  beforeEach(() => {
    forceNavigate.mockClear()
  })

  afterEach(() => {
    window.history.pushState({}, "", "/")
  })

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

  it("forces a full navigation when clicked on the page it already points to", async () => {
    // Next's client router treats a Link to the current URL as a no-op — on the
    // anonymous root that left the explore search state (held in client state,
    // never synced to the URL) untouched, so the logo looked dead. A real
    // navigation is the only thing that resets it.
    window.history.pushState({}, "", "/")
    render(<BrandLockup href="/" />)
    await userEvent.click(screen.getByRole("link", { name: /kayaktrek/i }))
    expect(forceNavigate).toHaveBeenCalledWith("/")
  })

  it("leaves normal client-side navigation alone when the link points elsewhere", async () => {
    window.history.pushState({}, "", "/dashboard")
    render(<BrandLockup href="/" />)
    await userEvent.click(screen.getByRole("link", { name: /kayaktrek/i }))
    expect(forceNavigate).not.toHaveBeenCalled()
  })
})
