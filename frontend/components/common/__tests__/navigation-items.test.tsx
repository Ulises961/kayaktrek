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
})
