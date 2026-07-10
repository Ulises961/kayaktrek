import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import { SidebarProvider } from "../../ui/sidebar"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}))

import { NavigationItems } from "../navigation-items"

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  }
})

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
})
