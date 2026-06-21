import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ opts }) },
}))

// Capture the last Marker props so tests can assert draggability and fire the
// dragend handler the real Leaflet marker would emit.
let lastMarkerProps: {
  draggable?: boolean
  eventHandlers?: { dragend?: (e: unknown) => void }
} = {}

vi.mock("react-leaflet", () => ({
  Marker: (props: {
    children?: React.ReactNode
    draggable?: boolean
    eventHandlers?: { dragend?: (e: unknown) => void }
  }) => {
    lastMarkerProps = props
    return (
      <div data-testid="place-marker" data-draggable={props.draggable ? "true" : "false"}>
        {props.children}
      </div>
    )
  },
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="place-popup">{children}</div>
  ),
}))

import { PlaceMarker, placeMarkerHtml } from "../place-marker"
import type { PlaceWithOwnership } from "@/lib/dtos/place"

const PLACE: PlaceWithOwnership = {
  id: "01952f1a-0000-7000-8000-000000000040",
  location: { type: "Point", coordinates: [-4.1, 50.3] },
  category: {
    id: "01952f1a-0000-7000-8000-0000000000c0",
    slug: "freshwater",
    name: "Freshwater",
    icon: "droplet",
  },
  label: "Spring behind the beach",
  note: "Reliable even in August",
  visibility: "private",
  itineraryId: "01952f1a-0000-7000-8000-000000000001",
  createdByUserId: "01952f1a-0000-7000-8000-0000000000aa",
  mine: true,
}

describe("placeMarkerHtml", () => {
  it("wraps the glyph svg in a teardrop tinted by the category colour", () => {
    const html = placeMarkerHtml("<svg data-glyph></svg>", "#0e7490")
    expect(html).toContain("<svg data-glyph></svg>")
    expect(html).toContain("#0e7490")
    // Teardrop: a rounded corner dropped to make the bottom-left point.
    expect(html).toContain("border-radius:50% 50% 50% 0")
  })
})

describe("PlaceMarker", () => {
  it("shows the label, category name and note in the popup", () => {
    render(<PlaceMarker place={PLACE} />)
    expect(screen.getByText("Spring behind the beach")).toBeInTheDocument()
    expect(screen.getByText("Freshwater")).toBeInTheDocument()
    expect(screen.getByText("Reliable even in August")).toBeInTheDocument()
  })

  it("is read-only by default: not draggable and no delete control", () => {
    render(<PlaceMarker place={PLACE} />)
    expect(screen.getByTestId("place-marker")).toHaveAttribute("data-draggable", "false")
    expect(screen.queryByText(/delete place/i)).not.toBeInTheDocument()
  })

  it("is draggable and reports the new position on dragend when editable", () => {
    const onDragEnd = vi.fn()
    render(<PlaceMarker place={PLACE} editable onDragEnd={onDragEnd} />)
    expect(screen.getByTestId("place-marker")).toHaveAttribute("data-draggable", "true")

    lastMarkerProps.eventHandlers?.dragend?.({
      target: { getLatLng: () => ({ lat: 51, lng: -3 }) },
    })
    expect(onDragEnd).toHaveBeenCalledWith(51, -3)
  })

  it("renders edit/delete controls that fire their callbacks when editable", async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PlaceMarker place={PLACE} editable onEdit={onEdit} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    await userEvent.click(screen.getByRole("button", { name: /delete place/i }))
    expect(onEdit).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalled()
  })
})
