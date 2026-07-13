import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import { SidebarProvider } from "../../ui/sidebar"

const mockUsePathname = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

import { SidebarSettingsLink } from "../sidebar-settings-link"

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

describe("SidebarSettingsLink", () => {
  it("links to /settings", () => {
    mockUsePathname.mockReturnValue("/dashboard")
    render(
      <SidebarProvider>
        <SidebarSettingsLink />
      </SidebarProvider>,
    )
    expect(screen.getByRole("link", { name: /settings/i }).getAttribute("href")).toBe("/settings")
  })

  it("is marked active on /settings", () => {
    mockUsePathname.mockReturnValue("/settings")
    render(
      <SidebarProvider>
        <SidebarSettingsLink />
      </SidebarProvider>,
    )
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("data-active", "true")
  })

  it("is marked active on a /settings sub-route", () => {
    mockUsePathname.mockReturnValue("/settings/change-password")
    render(
      <SidebarProvider>
        <SidebarSettingsLink />
      </SidebarProvider>,
    )
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("data-active", "true")
  })

  it("is not marked active elsewhere", () => {
    mockUsePathname.mockReturnValue("/dashboard")
    render(
      <SidebarProvider>
        <SidebarSettingsLink />
      </SidebarProvider>,
    )
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("data-active", "false")
  })
})
