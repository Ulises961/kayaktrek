import type { MapViewState } from "../../map/project-lng-lat"
import { projectLngLat, unprojectScreen, visibleBounds } from "../../map/project-lng-lat"
import type { Particle } from "../advection"
import {
  advanceFrame,
  forecastAreaPixels,
  meanSpeed,
  particleCountFor,
  particleCountForForecast,
  seedParticles,
  simulationTimeScale,
} from "../velocity-frame"
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

  it("lets a layer set its own trail limits, so swell can be short dashes where wind is long streaks", () => {
    const length = (limits: { minTrailPixels?: number; maxTrailPixels?: number }) => {
      const particles: Particle[] = [{ latitude: 54.1, longitude: -4.5, age: 0 }]
      const [tail, head] = advanceFrame(particles, eastwardField(8), view, size, 1 / 60, {
        pixelsPerSecondPerMetreSecond: 8,
        ...limits,
      })[0]
      return head.x - tail.x
    }

    // 8 m/s would trail 8 * 8 * 0.35 = 22.4 px unconstrained.
    expect(length({})).toBeCloseTo(22.4, 1)
    expect(length({ maxTrailPixels: 10 })).toBeCloseTo(10, 3)
    expect(length({ minTrailPixels: 30 })).toBeCloseTo(30, 3)
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

// The forecast is only drawn inside its disc, so density has to follow how much of the
// screen the disc covers: zooming out shrinks the disc on screen, and the same number of
// particles crammed into it would read as a dense blob.
describe("forecastAreaPixels", () => {
  const centre: [number, number] = [54.1, -4.5] // [latitude, longitude]
  const screenPixels = size.width * size.height

  it("is the disc's own area when it sits wholly on the screen", () => {
    // 5 km at zoom 10 near 54 degrees north is about 111 px.
    const radiusPixels = 5000 * (512 * 2 ** 10) / (40_075_016.686 * Math.cos((54.1 * Math.PI) / 180))

    const area = forecastAreaPixels(view, size, { center: centre, radiusKm: 5 })

    expect(area).toBeCloseTo(Math.PI * radiusPixels ** 2, -3)
    expect(area / (Math.PI * radiusPixels ** 2)).toBeCloseTo(1, 1)
  })

  it("is the whole screen when the disc is far bigger than it", () => {
    const area = forecastAreaPixels(view, size, { center: centre, radiusKm: 200 })

    expect(area / screenPixels).toBeCloseTo(1, 1)
  })

  it("is nothing when the disc is somewhere else entirely", () => {
    expect(forecastAreaPixels(view, size, { center: [30, 10], radiusKm: 30 })).toBe(0)
  })

  it("only counts the part of a disc that hangs over the screen's edge", () => {
    // Centred on the screen's left edge: about half is on screen.
    const [longitude] = unprojectScreen(view, size, 0, 400)
    const radiusPixels = 5000 * (512 * 2 ** 10) / (40_075_016.686 * Math.cos((54.1 * Math.PI) / 180))

    const area = forecastAreaPixels(view, size, { center: [54.1, longitude], radiusKm: 5 })

    expect(area / (Math.PI * radiusPixels ** 2)).toBeCloseTo(0.5, 1)
  })

  it("falls to a quarter for every zoom level out, as the disc shrinks on screen", () => {
    const disc = { center: centre, radiusKm: 5 }

    const near = forecastAreaPixels(view, size, disc)
    const far = forecastAreaPixels({ ...view, zoom: 9 }, size, disc)

    expect(far / near).toBeCloseTo(0.25, 1)
  })
})

describe("particleCountForForecast", () => {
  const disc = { center: [54.1, -4.5] as [number, number], radiusKm: 5 }

  it("is the multiplier times the part of the screen the forecast covers", () => {
    const area = forecastAreaPixels(view, size, disc)

    expect(particleCountForForecast(view, size, disc, 0.0016)).toBe(Math.round(area * 0.0016))
  })

  it("thins out as the map zooms out, so the density on screen stays the same", () => {
    const near = particleCountForForecast(view, size, disc, 0.0016)
    const far = particleCountForForecast({ ...view, zoom: 8 }, size, disc, 0.0016)

    expect(far).toBeLessThan(near / 10)
  })

  it("never asks for more than the whole screen would get", () => {
    const huge = { center: disc.center, radiusKm: 5000 }

    expect(particleCountForForecast(view, size, huge, 0.0016)).toBeLessThanOrEqual(
      particleCountFor(size, 0.0016),
    )
  })
})
