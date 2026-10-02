import { projectLngLat, unprojectScreen, visibleBounds, type MapViewState } from "../project-lng-lat"

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

describe("unprojectScreen", () => {
  it("is the inverse of projectLngLat, at any bearing and zoom", () => {
    const views: MapViewState[] = [
      view,
      { ...view, bearing: 37, zoom: 12.5 },
      { center: [12.1, -33.4], zoom: 6, bearing: 200, pitch: 0 },
    ]

    for (const mapView of views) {
      const [x, y] = projectLngLat(mapView, size, mapView.center[0] + 0.03, mapView.center[1] - 0.02)
      const [longitude, latitude] = unprojectScreen(mapView, size, x, y)

      expect(longitude).toBeCloseTo(mapView.center[0] + 0.03, 6)
      expect(latitude).toBeCloseTo(mapView.center[1] - 0.02, 6)
    }
  })

  it("gives the map centre for the middle of the screen", () => {
    const [longitude, latitude] = unprojectScreen(view, size, 200, 400)

    expect(longitude).toBeCloseTo(-4.5, 8)
    expect(latitude).toBeCloseTo(54.1, 8)
  })
})

describe("visibleBounds", () => {
  it("is the area the screen shows, around the centre", () => {
    const bounds = visibleBounds(view, size)

    expect(bounds.west).toBeLessThan(-4.5)
    expect(bounds.east).toBeGreaterThan(-4.5)
    expect(bounds.south).toBeLessThan(54.1)
    expect(bounds.north).toBeGreaterThan(54.1)
  })

  it("covers a tall screen more in latitude than in longitude", () => {
    const bounds = visibleBounds(view, size)

    // 400 x 800 px, so twice as many pixels vertically; a degree of latitude is longer than one
    // of longitude at 54 degrees north, so compare in pixels, not degrees.
    const [westX] = projectLngLat(view, size, bounds.west, 54.1)
    const [eastX] = projectLngLat(view, size, bounds.east, 54.1)
    expect(eastX - westX).toBeCloseTo(400, 3)
  })

  it("grows to contain the whole screen when the map is rotated", () => {
    const rotated = visibleBounds({ ...view, bearing: 45 }, size)
    const flat = visibleBounds(view, size)

    expect(rotated.east - rotated.west).toBeGreaterThan(flat.east - flat.west)
    expect(rotated.north - rotated.south).toBeGreaterThan(flat.north - flat.south)
  })

  it("can be padded, so particles are not culled right at the screen edge", () => {
    const tight = visibleBounds(view, size)
    const padded = visibleBounds(view, size, 50)

    expect(padded.west).toBeLessThan(tight.west)
    expect(padded.east).toBeGreaterThan(tight.east)
    expect(padded.north).toBeGreaterThan(tight.north)
    expect(padded.south).toBeLessThan(tight.south)
  })
})
