import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RoutePlaces } from "../route-places"
import type { PublicPlace } from "@/lib/dtos/itinerary"

function place(overrides: Partial<PublicPlace> = {}): PublicPlace {
  return {
    id: "pl1",
    label: "Slipway at Cala Verde",
    note: "Concrete ramp, parking above",
    location: { type: "Point", coordinates: [8, 43] },
    category: { slug: "slipway", name: "Slipway", icon: "anchor" },
    ...overrides,
  }
}

describe("RoutePlaces", () => {
  it("renders nothing when the route published no places", () => {
    const { container } = render(<RoutePlaces places={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a place's label and its note", () => {
    render(<RoutePlaces places={[place()]} />)
    expect(screen.getByText("Slipway at Cala Verde")).toBeInTheDocument()
    expect(screen.getByText("Concrete ramp, parking above")).toBeInTheDocument()
  })

  it("renders a place with no note without an empty line under it", () => {
    render(<RoutePlaces places={[place({ note: null })]} />)
    const row = screen.getByRole("button", { name: /slipway at cala verde/i })
    // Exactly the label, nothing else: an empty note element would still occupy a
    // line and make an uncommented place look like a broken one.
    expect(row.textContent).toBe("Slipway at Cala Verde")
    expect(row.querySelectorAll("span")).toHaveLength(1)
  })

  it("groups places under one heading per category", () => {
    render(
      <RoutePlaces
        places={[
          place({ id: "a", label: "North slipway" }),
          place({ id: "b", label: "South slipway" }),
          place({
            id: "c",
            label: "Overfalls off the point",
            category: { slug: "hazard", name: "Hazard", icon: "triangle-alert" },
          }),
        ]}
      />,
    )
    // Two slipways share one heading rather than repeating it — the grouping is what
    // makes the list scannable without anyone writing good prose.
    expect(screen.getAllByText("Slipway")).toHaveLength(1)
    expect(screen.getByText("Hazard")).toBeInTheDocument()
    expect(screen.getByText("North slipway")).toBeInTheDocument()
    expect(screen.getByText("South slipway")).toBeInTheDocument()
  })

  it("reports the place when a row is clicked", async () => {
    const onSelect = vi.fn()
    const target = place()
    render(<RoutePlaces places={[target]} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole("button", { name: /slipway at cala verde/i }))
    expect(onSelect).toHaveBeenCalledWith(target)
  })
})
