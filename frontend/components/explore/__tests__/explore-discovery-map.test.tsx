import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import type { ExploreItem } from "@/lib/dtos/itinerary"
import type { RouteData } from "@/lib/itinerary/public-routes"

const { flyTo, flyToBounds, latLngBounds } = vi.hoisted(() => ({
  flyTo: vi.fn(),
  flyToBounds: vi.fn(),
  latLngBounds: vi.fn((positions: [number, number][]) => ({ _mockBounds: positions })),
}))

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: { latLngBounds } }))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMap: vi.fn(() => ({ flyTo, flyToBounds, getZoom: () => 5 })),
  useMapEvents: vi.fn(() => null),
}))

import ExploreDiscoveryMap from "../explore-discovery-map"

function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: "route-1",
    name: "Aegean loop",
    totalMiles: 20,
    dayCount: 3,
    season: "summer",
    centroidLat: 37,
    centroidLng: 25,
    createdFromId: null,
    originalAuthor: null,
    ...overrides,
  }
}

function route(overrides: Partial<RouteData> = {}): RouteData {
  return {
    id: "route-1",
    name: "Aegean loop",
    positions: [
      [37, 25],
      [37.2, 25.3],
    ],
    days: [],
    totalMiles: 20,
    dayCount: 3,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ExploreDiscoveryMap selection navigation", () => {
  it("flies to the route bounds once its polyline has loaded", () => {
    const { rerender } = render(
      <ExploreDiscoveryMap
        items={[item()]}
        selectedId={null}
        selectedRoute={null}
        boundsEnabled={false}
        onSelect={vi.fn()}
        onBoundsChange={vi.fn()}
      />,
    )
    expect(flyToBounds).not.toHaveBeenCalled()

    rerender(
      <ExploreDiscoveryMap
        items={[item()]}
        selectedId="route-1"
        selectedRoute={route()}
        boundsEnabled={false}
        onSelect={vi.fn()}
        onBoundsChange={vi.fn()}
      />,
    )

    expect(latLngBounds).toHaveBeenCalledWith(route().positions)
    expect(flyToBounds).toHaveBeenCalledWith(
      { _mockBounds: route().positions },
      expect.objectContaining({ maxZoom: expect.any(Number) }),
    )
  })

  it("flies to the item's centroid immediately when the route hasn't loaded yet", () => {
    const { rerender } = render(
      <ExploreDiscoveryMap
        items={[item()]}
        selectedId={null}
        selectedRoute={null}
        boundsEnabled={false}
        onSelect={vi.fn()}
        onBoundsChange={vi.fn()}
      />,
    )

    rerender(
      <ExploreDiscoveryMap
        items={[item()]}
        selectedId="route-1"
        selectedRoute={null}
        boundsEnabled={false}
        onSelect={vi.fn()}
        onBoundsChange={vi.fn()}
      />,
    )

    expect(flyTo).toHaveBeenCalledWith([37, 25], expect.any(Number))
    expect(flyToBounds).not.toHaveBeenCalled()
  })

  it("does not navigate when nothing is selected", () => {
    render(
      <ExploreDiscoveryMap
        items={[item()]}
        selectedId={null}
        selectedRoute={null}
        boundsEnabled={false}
        onSelect={vi.fn()}
        onBoundsChange={vi.fn()}
      />,
    )
    expect(flyTo).not.toHaveBeenCalled()
    expect(flyToBounds).not.toHaveBeenCalled()
  })
})
