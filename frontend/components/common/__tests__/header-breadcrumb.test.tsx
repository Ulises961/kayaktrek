import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { HeaderBreadcrumb } from "../header-breadcrumb"
import { BreadcrumbProvider } from "../breadcrumb-context"
import { SetBreadcrumbs } from "../set-breadcrumbs"

describe("HeaderBreadcrumb", () => {
  it("renders nothing when no crumbs are set", () => {
    // Including the dividing rule — a lone separator hanging off the wordmark
    // is worse than no trail at all, and most pages set no crumbs.
    const { container } = render(
      <BreadcrumbProvider>
        <HeaderBreadcrumb />
      </BreadcrumbProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("divides the trail from the wordmark once there are crumbs", () => {
    const { container } = render(
      <BreadcrumbProvider>
        <SetBreadcrumbs crumbs={[{ label: "Trips", href: "/trips" }]} />
        <HeaderBreadcrumb />
      </BreadcrumbProvider>,
    )
    expect(container.querySelector("[data-slot='separator']")).toBeInTheDocument()
  })

  it("renders the crumbs pushed via SetBreadcrumbs/useBreadcrumbs", () => {
    render(
      <BreadcrumbProvider>
        <SetBreadcrumbs crumbs={[{ label: "Trips", href: "/trips" }, { label: "Cinque Terre" }]} />
        <HeaderBreadcrumb />
      </BreadcrumbProvider>,
    )
    expect(screen.getByText("Trips")).toBeInTheDocument()
    expect(screen.getByText("Cinque Terre")).toBeInTheDocument()
  })
})
