import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ setProfileVisibility: vi.fn() }))

import { setProfileVisibility } from "@/lib/profile/actions"
import { PublicProfileToggle } from "../public-profile-toggle"

beforeEach(() => vi.clearAllMocks())

describe("PublicProfileToggle", () => {
  it("shows the public-profile link when already public", () => {
    render(<PublicProfileToggle username="seapaddler" initialIsPublic={true} />)
    const link = screen.getByRole("link", { name: /view your public profile/i })
    expect(link.getAttribute("href")).toBe("/paddlers/seapaddler")
  })

  it("hides the link when private", () => {
    render(<PublicProfileToggle username="seapaddler" initialIsPublic={false} />)
    expect(screen.queryByRole("link", { name: /view your public profile/i })).toBeNull()
  })

  it("turns the profile public and reveals the link", async () => {
    vi.mocked(setProfileVisibility).mockResolvedValue({ success: true })
    render(<PublicProfileToggle username="seapaddler" initialIsPublic={false} />)
    await userEvent.click(screen.getByRole("switch"))
    expect(setProfileVisibility).toHaveBeenCalledWith(true)
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /view your public profile/i })).toBeDefined(),
    )
  })

  it("reverts the toggle and shows an error on failure", async () => {
    vi.mocked(setProfileVisibility).mockResolvedValue({ success: false, error: "Nope." })
    render(<PublicProfileToggle username="seapaddler" initialIsPublic={false} />)
    await userEvent.click(screen.getByRole("switch"))
    await waitFor(() => expect(screen.getByText("Nope.")).toBeDefined())
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
  })
})
