import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { formatPaddlerName } from "@/lib/user/format"

const mockLogout = vi.fn()
vi.mock("@/lib/auth/actions", () => ({
  logout: () => mockLogout(),
}))

import { UserMenu } from "../user-menu"

const account = {
  name: "Ada",
  surname: "Lovelace",
  username: "ada",
  mail: "ada@example.com",
  avatarUrl: null,
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /account menu/i }))
}

describe("UserMenu", () => {
  beforeEach(() => {
    mockLogout.mockReset()
    mockLogout.mockResolvedValue(undefined)
  })

  it("shows initials on the closed trigger, and neither name nor email", () => {
    render(<UserMenu account={account} />)
    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(screen.queryByText(account.mail)).not.toBeInTheDocument()
  })

  it("names the signed-in account once opened", async () => {
    render(<UserMenu account={account} />)
    await openMenu()
    expect(await screen.findByText(formatPaddlerName(account))).toBeInTheDocument()
    expect(screen.getByText(account.mail)).toBeInTheDocument()
  })

  it("links to the profile and to settings", async () => {
    render(<UserMenu account={account} />)
    await openMenu()

    expect(
      (await screen.findByRole("menuitem", { name: /profile/i })).closest("a"),
    ).toHaveAttribute("href", "/profile")
    expect(screen.getByRole("menuitem", { name: /settings/i }).closest("a")).toHaveAttribute(
      "href",
      "/settings",
    )
  })

  it("signs out from the menu", async () => {
    render(<UserMenu account={account} />)
    await openMenu()
    await userEvent.click(await screen.findByRole("menuitem", { name: /^sign out$/i }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it("reports progress while signing out and will not fire a second time", async () => {
    let release: () => void = () => {}
    mockLogout.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)))

    render(<UserMenu account={account} />)
    await openMenu()
    await userEvent.click(await screen.findByRole("menuitem", { name: /^sign out$/i }))

    const pending = await screen.findByRole("menuitem", { name: /signing out/i })
    await userEvent.click(pending)
    expect(mockLogout).toHaveBeenCalledTimes(1)

    release()
  })

  // The shell renders the menu whether or not the user record loaded — otherwise a
  // failed /api/user/me would leave a signed-in visitor with no way to sign out.
  it("still offers sign out when the account record is unavailable", async () => {
    render(<UserMenu account={null} />)
    await openMenu()
    expect(await screen.findByRole("menuitem", { name: /^sign out$/i })).toBeInTheDocument()
    expect(screen.queryByText(account.mail)).not.toBeInTheDocument()
  })

  // M23 §1. A null account means two different things — an anonymous visitor, and a signed-in
  // one whose /api/user/me call failed. The test above pins the second; these pin the first.
  // Only `isAuthenticated` separates them, which is why it is a prop and not `account == null`.
  describe("anonymous visitor", () => {
    it("offers a way in, not account actions", async () => {
      render(<UserMenu account={null} isAuthenticated={false} />)
      await openMenu()
      expect(await screen.findByRole("menuitem", { name: /sign in/i })).toBeInTheDocument()
      expect(screen.getByRole("menuitem", { name: /create account/i })).toBeInTheDocument()
    })

    it.each(["Profile", "Settings", "Sign out"])(
      "does not offer %s, which would only redirect to /login",
      async (label) => {
        render(<UserMenu account={null} isAuthenticated={false} />)
        await openMenu()
        // Wait for the menu to actually open before asserting an absence.
        expect(await screen.findByRole("menuitem", { name: /sign in/i })).toBeInTheDocument()
        expect(
          screen.queryByRole("menuitem", { name: new RegExp(`^${label}$`, "i") }),
        ).not.toBeInTheDocument()
      },
    )
  })
})
