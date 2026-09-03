import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SidebarProvider } from "../../ui/sidebar"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}))

import { NavigationItems } from "../navigation-items"

// The local matchMedia stub this file used to carry now lives in vitest.setup.ts,
// where every component that branches on a breakpoint can reach it.

describe("NavigationItems", () => {
  it("labels the paddler-connections nav item 'Paddlers', matching the page it links to", () => {
    render(
      <SidebarProvider>
        <NavigationItems />
      </SidebarProvider>,
    )
    expect(screen.getByText("Paddlers")).toBeInTheDocument()
    expect(screen.queryByText("Buddies")).not.toBeInTheDocument()
  })

  it("no longer shows the old static Invitations link — requests moved to the header", () => {
    render(
      <SidebarProvider>
        <NavigationItems />
      </SidebarProvider>,
    )
    expect(screen.queryByText("Invitations")).not.toBeInTheDocument()
  })

  // M23 §1. /explore renders through the (app) shell while staying ungated in proxy.ts,
  // so this sidebar is shown to signed-out visitors. It used to list every authenticated
  // segment, and each one redirected to /login.
  it("offers an anonymous visitor Explore, the one segment they can actually use", () => {
    render(
      <SidebarProvider>
        <NavigationItems isAuthenticated={false} />
      </SidebarProvider>,
    )
    expect(screen.getByText("Explore")).toBeInTheDocument()
  })

  it.each(["Dashboard", "Trips", "Itineraries", "Gear", "Paddlers", "Logs"])(
    "hides the auth-gated %s link from an anonymous visitor",
    (label) => {
      render(
        <SidebarProvider>
          <NavigationItems isAuthenticated={false} />
        </SidebarProvider>,
      )
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    },
  )

  it("still shows the full nav to a signed-in viewer", () => {
    render(
      <SidebarProvider>
        <NavigationItems isAuthenticated />
      </SidebarProvider>,
    )
    for (const label of [
      "Dashboard",
      "Trips",
      "Itineraries",
      "Explore",
      "Gear",
      "Paddlers",
      "Logs",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
