import type { MapViewState } from "../../map/project-lng-lat"
import { projectLngLat } from "../../map/project-lng-lat"
import type { Particle } from "../advection"
import { advanceFrame, meanSpeed, simulationTimeScale } from "../velocity-frame"
import type { VelocityField } from "../velocity"

const size = { width: 400, height: 800 }
const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

// A 2x2 field over the view, blowing east at 4 m/s everywhere.
function eastwardField(speed: number): VelocityField {
  return { north: 54.3, south: 53.9, west: -4.7, east: -4.3, nx: 2, ny: 2, u: [speed, speed, speed, speed], v: [0, 0, 0, 0] }
}

describe("meanSpeed", () => {
  it("is the magnitude of (u, v), averaged over the cells", () => {
    const field: VelocityField = { ...eastwardField(0), u: [3, 3, 3, 3], v: [4, 4, 4, 4] }

    expect(meanSpeed(field)).toBeCloseTo(5, 6)
  })

  it("ignores masked cells", () => {
    const field: VelocityField = { ...eastwardField(0), u: [2, null, 2, null], v: [0, null, 0, null] }

    expect(meanSpeed(field)).toBeCloseTo(2, 6)
  })

  it("is zero when every cell is masked", () => {
    const field: VelocityField = { ...eastwardField(0), u: [null, null, null, null], v: [null, null, null, null] }

    expect(meanSpeed(field)).toBe(0)
  })
})

describe("simulationTimeScale", () => {
  it("makes a 1 m/s drift cover the requested number of screen pixels per real second", () => {
    const pixelsPerSecondPerMetreSecond = 8
    const scale = simulationTimeScale(10, 54.1, pixelsPerSecondPerMetreSecond)

    // Drift east for one real second at 1 m/s, simulated at `scale`, and measure it on screen.
    const metresPerDegreeLongitude = 111_320 * Math.cos((54.1 * Math.PI) / 180)
    const driftedLongitude = -4.5 + (1 * scale) / metresPerDegreeLongitude
    const [x] = projectLngLat(view, size, driftedLongitude, 54.1)

    expect(x - 200).toBeCloseTo(pixelsPerSecondPerMetreSecond, 1)
  })

  it("simulates less time per real second the further in you zoom, so drift stays the same on screen", () => {
    expect(simulationTimeScale(12, 54.1, 8)).toBeCloseTo(simulationTimeScale(10, 54.1, 8) / 4, 6)
  })
})

describe("advanceFrame", () => {
  it("returns a segment from where each particle was to where it is now, in screen pixels", () => {
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]
    const field = eastwardField(4)

    const segments = advanceFrame(particles, field, view, size, 1 / 60, { pixelsPerSecondPerMetreSecond: 8 })

    expect(segments).toHaveLength(1)
    const [before, after] = segments[0]
    expect(before.x).toBeCloseTo(200, 6)
    expect(before.y).toBeCloseTo(400, 6)
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeCloseTo(before.y, 3)
    // 4 m/s at 8 px per second per m/s is 32 px/s, so one 60 fps frame is about half a pixel.
    expect(after.x - before.x).toBeCloseTo(32 / 60, 2)
  })

  it("draws nothing for a particle that respawned this frame, rather than a streak across the map", () => {
    // Already past its lifetime, so this step respawns it somewhere else.
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 1e9 }]
    const field = eastwardField(4)

    const segments = advanceFrame(particles, field, view, size, 1 / 60, {
      pixelsPerSecondPerMetreSecond: 8,
      random: () => 0.9,
    })

    expect(segments).toHaveLength(0)
  })

  it("skips particles that are off the screen entirely", () => {
    // Inside the field (which spans -4.7 to -4.3) but nowhere near the screen.
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.4, age: 0 }]
    const field = eastwardField(4)

    // At zoom 14 the 400px-wide screen covers a sliver of the field around -4.5.
    const segments = advanceFrame(particles, field, { ...view, zoom: 14 }, size, 1 / 60, {
      pixelsPerSecondPerMetreSecond: 8,
    })

    expect(segments).toHaveLength(0)
  })

  it("moves the particles themselves forward, so the next frame continues from here", () => {
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]

    advanceFrame(particles, eastwardField(4), view, size, 1 / 60, { pixelsPerSecondPerMetreSecond: 8 })

    expect(particles[0].longitude).toBeGreaterThan(-4.5)
  })
})
