import { discCell } from "@shared/landing/ambient-wind"

import { projectLngLat, type MapViewState } from "../../map/project-lng-lat"
import { discOnScreen, maskFieldToDisc } from "../forecast-cell"
import type { VelocityField } from "../velocity"

const size = { width: 400, height: 800 }
const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

// 5x5 cells over a 1 degree box, blowing east at 4 m/s everywhere.
function uniformField(): VelocityField {
  const cells = 25
  return {
    north: 54.6,
    south: 53.6,
    west: -5.0,
    east: -4.0,
    nx: 5,
    ny: 5,
    u: new Array(cells).fill(4),
    v: new Array(cells).fill(0),
  }
}

describe("maskFieldToDisc", () => {
  // The disc is web's own (maskGridToDisc in lib/landing/ambient-wind.ts), so mobile clips
  // exactly where the web planner does. These pin the behaviour mobile relies on.
  const center: [number, number] = [54.1, -4.5] // [latitude, longitude]

  it("keeps the shape of the field it was given", () => {
    const masked = maskFieldToDisc(uniformField(), center, 30)

    expect(masked).toMatchObject({ north: 54.6, south: 53.6, west: -5.0, east: -4.0, nx: 5, ny: 5 })
    expect(masked.u).toHaveLength(25)
    expect(masked.v).toHaveLength(25)
  })

  it("masks every cell outside the disc, so no particle can live there", () => {
    // 0.5 degrees of longitude at 54 degrees north is about 33 km, so the corners are well outside 30 km.
    const masked = maskFieldToDisc(uniformField(), center, 30)

    const corners = [0, 4, 20, 24]
    for (const index of corners) {
      expect(masked.u[index]).toBeNull()
      expect(masked.v[index]).toBeNull()
    }
  })

  it("leaves the cell at the centre of the disc at full strength", () => {
    const masked = maskFieldToDisc(uniformField(), center, 60)

    expect(masked.u[12]).toBe(4)
  })

  it("fades the flow towards the rim, as the web planner does", () => {
    const masked = maskFieldToDisc(uniformField(), center, 35)

    // The middle of the row below the top is 0.25 degrees (about 28 km) north of centre: inside a
    // 35 km disc, at about 79% of its radius, past the 70% where web starts fading the flow.
    const nearRim = masked.u[7]
    expect(nearRim).not.toBeNull()
    expect(nearRim as number).toBeLessThan(4)
    expect(nearRim as number).toBeGreaterThan(0)
  })

  it("keeps cells that were already masked (land) masked", () => {
    const field = uniformField()
    field.u[12] = null
    field.v[12] = null

    const masked = maskFieldToDisc(field, center, 60)

    expect(masked.u[12]).toBeNull()
    expect(masked.v[12]).toBeNull()
  })
})

describe("the forecast disc", () => {
  it("is built from the day's route by web's own discCell, with its minimum radius", () => {
    const { center, radiusKm } = discCell([
      [54.1, -4.5],
      [54.12, -4.48],
    ])

    expect(center[0]).toBeCloseTo(54.11, 6)
    expect(radiusKm).toBe(38)
  })
})

describe("discOnScreen", () => {
  it("is centred where the disc's centre projects to", () => {
    const disc = discOnScreen(view, size, [54.1, -4.5], 30)
    const [x, y] = projectLngLat(view, size, -4.5, 54.1)

    expect(disc.x).toBeCloseTo(x, 6)
    expect(disc.y).toBeCloseTo(y, 6)
  })

  it("has the radius, in pixels, of the distance it stands for", () => {
    const disc = discOnScreen(view, size, [54.1, -4.5], 30)

    // 30 km due east of the centre, measured on screen.
    const metresPerDegreeLongitude = 111_320 * Math.cos((54.1 * Math.PI) / 180)
    const east = -4.5 + 30_000 / metresPerDegreeLongitude
    const [eastX] = projectLngLat(view, size, east, 54.1)
    expect(disc.radius).toBeCloseTo(eastX - disc.x, 0)
  })

  it("doubles with each zoom level", () => {
    const near = discOnScreen({ ...view, zoom: 11 }, size, [54.1, -4.5], 30)
    const far = discOnScreen({ ...view, zoom: 10 }, size, [54.1, -4.5], 30)

    expect(near.radius).toBeCloseTo(far.radius * 2, 6)
  })
})
