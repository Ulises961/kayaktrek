import { projectLngLat, type MapViewState } from "../project-lng-lat"

const size = { width: 400, height: 800 }

const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

describe("projectLngLat", () => {
  it("puts the map centre in the middle of the screen", () => {
    const [x, y] = projectLngLat(view, size, -4.5, 54.1)

    expect(x).toBeCloseTo(200, 6)
    expect(y).toBeCloseTo(400, 6)
  })

  it("puts places east of the centre to the right and north of it above", () => {
    const [eastX, eastY] = projectLngLat(view, size, -4.4, 54.1)
    const [northX, northY] = projectLngLat(view, size, -4.5, 54.2)

    expect(eastX).toBeGreaterThan(200)
    expect(eastY).toBeCloseTo(400, 6)
    expect(northX).toBeCloseTo(200, 6)
    expect(northY).toBeLessThan(400)
  })

  it("doubles the pixel distance for every zoom level", () => {
    const [x10] = projectLngLat({ ...view, zoom: 10 }, size, -4.4, 54.1)
    const [x11] = projectLngLat({ ...view, zoom: 11 }, size, -4.4, 54.1)

    expect(x11 - 200).toBeCloseTo((x10 - 200) * 2, 6)
  })

  it("measures 512 * 2^zoom pixels around the whole world at the equator", () => {
    const [x] = projectLngLat({ center: [0, 0], zoom: 0, bearing: 0, pitch: 0 }, size, 90, 0)

    // A quarter of the way round the world at zoom 0 is 512 / 4 pixels.
    expect(x - 200).toBeCloseTo(128, 6)
  })

  it("keeps the same ground distance per degree of longitude at any latitude (Mercator)", () => {
    const [xEquator] = projectLngLat({ center: [0, 0], zoom: 8, bearing: 0, pitch: 0 }, size, 0.5, 0)
    const [xNorth] = projectLngLat({ center: [0, 60], zoom: 8, bearing: 0, pitch: 0 }, size, 0.5, 60)

    expect(xNorth).toBeCloseTo(xEquator, 6)
  })

  it("rotates the map with the bearing, so facing east puts north on the left", () => {
    // Bearing is the compass direction pointing up the screen: facing east, north is to the left.
    const [x, y] = projectLngLat({ ...view, bearing: 90 }, size, -4.5, 54.2)

    expect(x).toBeLessThan(200)
    expect(y).toBeCloseTo(400, 3)
  })
})
