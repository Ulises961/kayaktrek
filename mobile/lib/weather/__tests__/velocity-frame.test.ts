import type { MapViewState } from "../../map/project-lng-lat"
import { projectLngLat, visibleBounds } from "../../map/project-lng-lat"
import type { Particle } from "../advection"
import { advanceFrame, meanSpeed, particleCountFor, seedParticles, simulationTimeScale } from "../velocity-frame"
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
    const [tail, head] = segments[0]
    // The head is where the particle is now: a frame's drift east of the screen centre.
    // 4 m/s at 8 px per second per m/s is 32 px/s, about half a pixel per 60 fps frame.
    expect(head.x).toBeCloseTo(200 + 32 / 60, 3)
    expect(head.y).toBeCloseTo(400, 3)
    // The tail trails behind it, back along the flow: 32 px/s for 0.35 s is 11.2 px.
    expect(tail.x).toBeCloseTo(head.x - 11.2, 2)
    expect(tail.y).toBeCloseTo(head.y, 3)
  })

  it("makes the trail longer for a faster flow and shorter for a slower one", () => {
    const length = (speed: number) => {
      const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]
      const [tail, head] = advanceFrame(particles, eastwardField(speed), view, size, 1 / 60, {
        pixelsPerSecondPerMetreSecond: 8,
      })[0]
      return head.x - tail.x
    }

    expect(length(8)).toBeGreaterThan(length(4))
    expect(length(4)).toBeGreaterThan(length(2))
  })

  it("never draws a trail shorter than a few pixels, so a light breeze still shows", () => {
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]

    const [tail, head] = advanceFrame(particles, eastwardField(0.1), view, size, 1 / 60, {
      pixelsPerSecondPerMetreSecond: 8,
    })[0]

    expect(head.x - tail.x).toBeCloseTo(4, 3)
  })

  it("draws no trail for a particle that is not moving, rather than guessing a direction", () => {
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]

    const segments = advanceFrame(particles, eastwardField(0), view, size, 1 / 60, {
      pixelsPerSecondPerMetreSecond: 8,
    })

    expect(segments).toHaveLength(0)
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

  it("moves a particle that is off the screen back onto it, instead of spending it out of sight", () => {
    // Inside the field (which spans -4.7 to -4.3) but nowhere near the screen.
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.4, age: 0 }]
    const zoomedIn = { ...view, zoom: 14 }

    advanceFrame(particles, eastwardField(4), zoomedIn, size, 1 / 60, { pixelsPerSecondPerMetreSecond: 8 })

    // At zoom 14 the 400px-wide screen covers a sliver of the field around -4.5.
    const onScreen = visibleBounds(zoomedIn, size, 64)
    expect(particles[0].longitude).toBeGreaterThanOrEqual(onScreen.west)
    expect(particles[0].longitude).toBeLessThanOrEqual(onScreen.east)
  })

  it("keeps all of its particles on the screen over time, however much bigger the field is", () => {
    // The field spans 0.4 degrees; at zoom 14 the screen shows well under 0.02 of it.
    const zoomedIn = { ...view, zoom: 14 }
    const field = eastwardField(4)
    const particles = seedParticles(field, zoomedIn, size, 300)

    for (let frame = 0; frame < 120; frame++) {
      advanceFrame(particles, field, zoomedIn, size, 1 / 60, { pixelsPerSecondPerMetreSecond: 8 })
    }

    const onScreen = visibleBounds(zoomedIn, size, 64)
    expect(particles).toHaveLength(300)
    for (const particle of particles) {
      expect(particle.longitude).toBeGreaterThanOrEqual(onScreen.west)
      expect(particle.longitude).toBeLessThanOrEqual(onScreen.east)
      expect(particle.latitude).toBeGreaterThanOrEqual(onScreen.south)
      expect(particle.latitude).toBeLessThanOrEqual(onScreen.north)
    }
  })

  it("moves the particles themselves forward, so the next frame continues from here", () => {
    const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]

    advanceFrame(particles, eastwardField(4), view, size, 1 / 60, { pixelsPerSecondPerMetreSecond: 8 })

    expect(particles[0].longitude).toBeGreaterThan(-4.5)
  })
})

// Web sizes the field by the viewport (leaflet-velocity: particles = viewport pixels *
// particleMultiplier), so the density a paddler sees does not depend on how big the
// day's forecast area happens to be. Mobile matches it.
describe("particleCountFor", () => {
  it("is the screen's pixel count times the multiplier", () => {
    expect(particleCountFor({ width: 400, height: 800 }, 0.0016)).toBe(512)
  })

  it("is zero for a screen with no size yet", () => {
    expect(particleCountFor({ width: 0, height: 0 }, 0.0016)).toBe(0)
  })
})

describe("seedParticles", () => {
  it("seeds the requested number on the screen, not across the whole field", () => {
    const zoomedIn = { ...view, zoom: 14 }

    const particles = seedParticles(eastwardField(4), zoomedIn, size, 250)

    const onScreen = visibleBounds(zoomedIn, size, 64)
    expect(particles).toHaveLength(250)
    for (const particle of particles) {
      expect(particle.longitude).toBeGreaterThanOrEqual(onScreen.west)
      expect(particle.longitude).toBeLessThanOrEqual(onScreen.east)
      expect(particle.latitude).toBeGreaterThanOrEqual(onScreen.south)
      expect(particle.latitude).toBeLessThanOrEqual(onScreen.north)
    }
  })

  it("seeds nothing when the screen is showing ground the field does not cover", () => {
    const elsewhere: MapViewState = { center: [30, -20], zoom: 10, bearing: 0, pitch: 0 }

    expect(seedParticles(eastwardField(4), elsewhere, size, 100)).toEqual([])
  })
})
