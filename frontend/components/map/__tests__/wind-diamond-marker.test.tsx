import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ opts }) },
}))

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
      <div data-testid="wind-diamond-marker" data-draggable={props.draggable ? "true" : "false"}>
        {props.children}
      </div>
    )
  },
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="wind-diamond-popup">{children}</div>
  ),
}))

import { WindDiamondMarker } from "../wind-diamond-marker"
import type { WindDiamond } from "@/lib/dtos/wind-diamond"

const DIAMOND: WindDiamond = {
  id: "01952f1a-0000-7000-8000-000000000050",
  name: "Funnel off the ridge",
  location: { type: "Point", coordinates: [-4.1, 50.3] },
  notes: "Katabatic gusts reported on NW synoptic flow",
  itineraryId: "01952f1a-0000-7000-8000-000000000001",
  createdByUserId: "01952f1a-0000-7000-8000-0000000000aa",
}

describe("WindDiamondMarker", () => {
  it("shows the name and notes in the popup", () => {
    render(<WindDiamondMarker diamond={DIAMOND} />)
    expect(screen.getByText("Funnel off the ridge")).toBeInTheDocument()
    expect(screen.getByText("Katabatic gusts reported on NW synoptic flow")).toBeInTheDocument()
  })

  it("falls back to a generic label when the diamond has no name", () => {
    render(<WindDiamondMarker diamond={{ ...DIAMOND, name: null }} />)
    expect(screen.getByText(/wind hazard/i)).toBeInTheDocument()
  })

  it("is read-only by default: not draggable and no delete control", () => {
    render(<WindDiamondMarker diamond={DIAMOND} />)
    expect(screen.getByTestId("wind-diamond-marker")).toHaveAttribute("data-draggable", "false")
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
  })

  it("is draggable and reports the new position on dragend when editable", () => {
    const onDragEnd = vi.fn()
    render(<WindDiamondMarker diamond={DIAMOND} editable onDragEnd={onDragEnd} />)
    expect(screen.getByTestId("wind-diamond-marker")).toHaveAttribute("data-draggable", "true")

    lastMarkerProps.eventHandlers?.dragend?.({
      target: { getLatLng: () => ({ lat: 51, lng: -3 }) },
    })
    expect(onDragEnd).toHaveBeenCalledWith(51, -3)
  })

  it("renders edit/delete controls that fire their callbacks when editable", async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<WindDiamondMarker diamond={DIAMOND} editable onEdit={onEdit} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }))
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    expect(onEdit).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalled()
  })
})
