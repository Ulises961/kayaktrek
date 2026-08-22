import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouteGallery } from "../route-gallery"
import { routePhotos } from "@/lib/itinerary/public-routes"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { POINT_TYPE } from "@/lib/dtos/point"

function route(overrides: Partial<RouteData> = {}): RouteData {
  return {
    id: "r1",
    name: "Aegean loop",
    positions: [],
    days: [
      {
        dayNumber: 1,
        date: null,
        color: "#2272b6",
        distanceNm: 4,
        points: [
          {
            id: "p1",
            lat: 43,
            lon: 8,
            type: POINT_TYPE.STOP,
            name: "Cala Verde",
            images: [{ url: "/a.jpg", caption: "Parking above the slipway" }],
            pointNumber: 1,
          },
        ],
      },
    ],
    boundaryColors: {},
    totalMiles: 4,
    dayCount: 1,
    ...overrides,
  }
}

describe("routePhotos", () => {
  it("flattens every opted-in photo in day-then-route order", () => {
    const twoDays = route({
      days: [
        { ...route().days[0], dayNumber: 1 },
        {
          ...route().days[0],
          dayNumber: 2,
          points: [
            {
              ...route().days[0].points[0],
              id: "p2",
              images: [{ url: "/b.jpg", caption: "Second" }],
            },
          ],
        },
      ],
    })
    expect(routePhotos(twoDays).map((p) => p.url)).toEqual(["/a.jpg", "/b.jpg"])
  })

  it("falls back to the point's name when the author wrote no caption", () => {
    const uncaptioned = route({
      days: [
        {
          ...route().days[0],
          points: [{ ...route().days[0].points[0], images: [{ url: "/a.jpg", caption: null }] }],
        },
      ],
    })
    // A flat gallery has no grouping heading to name a photo, so an uncaptioned one
    // would otherwise be anonymous.
    expect(routePhotos(uncaptioned)[0].label).toBe("Cala Verde")
  })

  it("falls back to the day when the point has neither caption nor name", () => {
    const bare = route({
      days: [
        {
          ...route().days[0],
          dayNumber: 3,
          points: [
            {
              ...route().days[0].points[0],
              name: null,
              images: [{ url: "/a.jpg", caption: null }],
            },
          ],
        },
      ],
    })
    expect(routePhotos(bare)[0].label).toBe("Day 3")
  })

  it("returns nothing for a route with no photos", () => {
    const bare = route({
      days: [{ ...route().days[0], points: [{ ...route().days[0].points[0], images: [] }] }],
    })
    expect(routePhotos(bare)).toEqual([])
  })
})

describe("RouteGallery", () => {
  it("renders nothing at all when there are no photos", () => {
    const { container } = render(<RouteGallery photos={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("names each photo by its label for both sighted and assistive readers", () => {
    render(<RouteGallery photos={routePhotos(route())} />)
    expect(screen.getByAltText("Parking above the slipway")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Parking above the slipway" })).toBeInTheDocument()
  })

  it("reports the photo's point when clicked, so the map can pan to it", async () => {
    const onSelect = vi.fn()
    render(<RouteGallery photos={routePhotos(route())} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole("button", { name: "Parking above the slipway" }))
    expect(onSelect).toHaveBeenCalledWith("p1")
  })
})
