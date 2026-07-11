import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SetBreadcrumbs } from "../set-breadcrumbs"
import { BreadcrumbProvider, useBreadcrumbContext } from "../breadcrumb-context"

function CrumbsProbe() {
  const { crumbs } = useBreadcrumbContext()
  return <span>{crumbs.map((c) => c.label).join(" / ") || "empty"}</span>
}

describe("SetBreadcrumbs", () => {
  it("renders nothing itself", () => {
    const { container } = render(
      <BreadcrumbProvider>
        <SetBreadcrumbs crumbs={[{ label: "Profile" }]} />
      </BreadcrumbProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("pushes its crumbs into the breadcrumb context", () => {
    render(
      <BreadcrumbProvider>
        <SetBreadcrumbs crumbs={[{ label: "Profile" }]} />
        <CrumbsProbe />
      </BreadcrumbProvider>,
    )
    expect(screen.getByText("Profile")).toBeInTheDocument()
  })
})
