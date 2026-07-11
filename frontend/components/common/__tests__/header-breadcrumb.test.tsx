import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { HeaderBreadcrumb } from "../header-breadcrumb"
import { BreadcrumbProvider } from "../breadcrumb-context"
import { SetBreadcrumbs } from "../set-breadcrumbs"

describe("HeaderBreadcrumb", () => {
  it("renders nothing when no crumbs are set", () => {
    const { container } = render(
      <BreadcrumbProvider>
        <HeaderBreadcrumb />
      </BreadcrumbProvider>,
    )
    expect(container).toBeEmptyDOMElement()
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
