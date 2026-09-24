import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { AppSidebar } from "../app-sidebar"
import { SidebarProvider } from "../../ui/sidebar"
import packageJson from "@/package.json"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}))

describe("AppSidebar", () => {
  it("displays the version from package.json, not a hardcoded string", () => {
    // Regression guard: this drifted to "0.1.0-dev" for six releases because nothing tied
    // the displayed version to what was actually shipped (backend/pyproject.toml and
    // frontend/package.json were bumped at release time, this string never was).
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByText(`v${packageJson.version}`)).toBeInTheDocument()
  })

  it("exposes the destinations as a navigation landmark", () => {
    // The sidebar rendered its destinations as a bare list, so a screen-reader user had no
    // landmark to jump to — the page's only <nav> was the breadcrumb, which renders nothing
    // when a page sets no crumbs. It is also what the anonymous-access e2e guard looks for
    // when it checks that an unrecognised visitor is offered no doors leading only to /login.
    render(
      <SidebarProvider>
        <AppSidebar isAuthenticated={false} />
      </SidebarProvider>,
    )

    const nav = screen.getByRole("navigation", { name: /main/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByText("Explore")).toBeInTheDocument()
  })
})
