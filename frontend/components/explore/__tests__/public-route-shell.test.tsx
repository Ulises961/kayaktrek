import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PublicRouteShell } from "../public-route-shell"

function renderShell() {
  return render(
    <PublicRouteShell map={<div data-testid="map" />}>
      <p>Aegean loop</p>
    </PublicRouteShell>,
  )
}

describe("PublicRouteShell", () => {
  it("renders the map and the detail panel it is given", () => {
    renderShell()
    expect(screen.getByTestId("map")).toBeInTheDocument()
    expect(screen.getByText("Aegean loop")).toBeInTheDocument()
  })

  it("opens the panel on arrival, and says so on the control that collapses it", () => {
    renderShell()
    const toggle = screen.getByTestId("route-detail-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveAccessibleName("Hide route details")
    expect(document.getElementById("route-detail-panel")).not.toHaveAttribute("inert")
  })

  it("collapses and reopens from the same control", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByTestId("route-detail-toggle")

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAccessibleName("Show route details")
    // Off-screen rather than unmounted, so it slides. `inert` is what keeps it out
    // of the tab order while it is out of sight.
    expect(document.getElementById("route-detail-panel")).toHaveAttribute("inert")

    // The control sits outside the panel it hides, or collapsing it would make the
    // only way back inert too.
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById("route-detail-panel")).not.toHaveAttribute("inert")
  })

  it("keeps the map mounted across a collapse", async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByTestId("route-detail-toggle"))
    // The panel overlays the map below `md` and displaces it from `md`; either way
    // Leaflet must not be torn down and refitted on a toggle.
    expect(screen.getByTestId("map")).toBeInTheDocument()
  })

  it("names the panel from the control that opens it", () => {
    renderShell()
    expect(screen.getByTestId("route-detail-toggle")).toHaveAttribute(
      "aria-controls",
      "route-detail-panel",
    )
  })
})
