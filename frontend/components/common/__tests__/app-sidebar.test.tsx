import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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
})
