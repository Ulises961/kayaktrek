import type { MapViewState } from "../../map/project-lng-lat"
import {
  EARTH_CIRCUMFERENCE_METRES,
  pixelsPerMetre,
  projectLngLat,
  unprojectScreen,
  visibleBounds,
} from "../../map/project-lng-lat"
import type { Particle } from "../advection"
import {
  advanceFrame,
  AREA_PADDING_PX,
  DEFAULT_TRAIL_SECONDS,
  forecastAreaPixels,
  MAX_TRAIL_PX,
  meanSpeed,
  MIN_TRAIL_PX,
  particleCountFor,
  particleCountForForecast,
  seedParticles,
  simulationTimeScale,
} from "../velocity-frame"
import type { VelocityField } from "../velocity"

const size = { width: 400, height: 800 }
const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }
const [CENTRE_LONGITUDE, CENTRE_LATITUDE] = view.center
const centreX = size.width / 2
const centreY = size.height / 2

// How the tests drive a frame: 60 fps, with a stated visual speed, so what they expect is
// derived from these and from the real constants rather than from copied numbers.
const FRAME_SECONDS = 1 / 60
const PIXELS_PER_SECOND_PER_METRE_SECOND = 8
const options = { pixelsPerSecondPerMetreSecond: PIXELS_PER_SECOND_PER_METRE_SECOND }
const MULTIPLIER = 0.0016
const DISC_RADIUS_KM = 5

// How far a particle drifts on screen in one frame, and the trail that makes of it.
function driftPixelsPerFrame(speed: number): number {
  return (speed * PIXELS_PER_SECOND_PER_METRE_SECOND) * FRAME_SECONDS
}
function expectedTrailPixels(speed: number): number {
  const pixelsPerSecond = speed * PIXELS_PER_SECOND_PER_METRE_SECOND
  return Math.min(Math.max(pixelsPerSecond * DEFAULT_TRAIL_SECONDS, MIN_TRAIL_PX), MAX_TRAIL_PX)
}

// A 2x2 field over the view, blowing east at `speed` everywhere.
function eastwardField(speed: number): VelocityField {
  return { north: 54.3, south: 53.9, west: -4.7, east: -4.3, nx: 2, ny: 2, u: [speed, speed, speed, speed], v: [0, 0, 0, 0] }
}

describe("meanSpeed", () => {
  it("is the magnitude of (u, v), averaged over the cells", () => {
    const field: VelocityField = { ...eastwardField(0), u: [3, 3, 3, 3], v: [4, 4, 4, 4] }

    expect(meanSpeed(field)).toBeCloseTo(Math.hypot(3, 4), 6)
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
    const scale = simulationTimeScale(view.zoom, CENTRE_LATITUDE, PIXELS_PER_SECOND_PER_METRE_SECOND)

    // Drift east for one real second at 1 m/s, simulated at `scale`, and measure it on screen.
    const metresPerDegreeLongitude =
      (EARTH_CIRCUMFERENCE_METRES / 360) * Math.cos((CENTRE_LATITUDE * Math.PI) / 180)
    const driftedLongitude = CENTRE_LONGITUDE + (1 * scale) / metresPerDegreeLongitude
    const [x] = projectLngLat(view, size, driftedLongitude, CENTRE_LATITUDE)

    expect(x - centreX).toBeCloseTo(PIXELS_PER_SECOND_PER_METRE_SECOND, 1)
  })

  it("simulates less time per real second the further in you zoom, so drift stays the same on screen", () => {
    const near = simulationTimeScale(view.zoom + 2, CENTRE_LATITUDE, PIXELS_PER_SECOND_PER_METRE_SECOND)
    const far = simulationTimeScale(view.zoom, CENTRE_LATITUDE, PIXELS_PER_SECOND_PER_METRE_SECOND)

    // Two zoom levels in is four times as many pixels per metre, so a quarter of the time.
    expect(near).toBeCloseTo(far / 4, 6)
  })
})

describe("advanceFrame", () => {
  const speed = 4

  it("returns a segment from where each particle was to where it is now, in screen pixels", () => {
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]

    const segments = advanceFrame(particles, eastwardField(speed), view, size, FRAME_SECONDS, options)

    expect(segments).toHaveLength(1)
    const [tail, head] = segments[0]
    // The head is where the particle is now: a frame's drift east of the screen centre.
    expect(head.x).toBeCloseTo(centreX + driftPixelsPerFrame(speed), 3)
    expect(head.y).toBeCloseTo(centreY, 3)
    // The tail trails behind it, back along the flow.
    expect(head.x - tail.x).toBeCloseTo(expectedTrailPixels(speed), 2)
    expect(tail.y).toBeCloseTo(head.y, 3)
  })

  it("makes the trail longer for a faster flow and shorter for a slower one", () => {
    const length = (flow: number) => {
      const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]
      const [tail, head] = advanceFrame(particles, eastwardField(flow), view, size, FRAME_SECONDS, options)[0]
      return head.x - tail.x
    }

    // Three speeds far enough apart that none is clamped.
    const slow = (MIN_TRAIL_PX / DEFAULT_TRAIL_SECONDS / PIXELS_PER_SECOND_PER_METRE_SECOND) * 2
    expect(length(slow * 2)).toBeGreaterThan(length(slow))
    expect(length(slow * 4)).toBeGreaterThan(length(slow * 2))
  })

  it("never draws a trail shorter than the minimum, so a light breeze still shows", () => {
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]
    // Slow enough that its own trail would be well under the minimum.
    const breeze = MIN_TRAIL_PX / DEFAULT_TRAIL_SECONDS / PIXELS_PER_SECOND_PER_METRE_SECOND / 10

    const [tail, head] = advanceFrame(particles, eastwardField(breeze), view, size, FRAME_SECONDS, options)[0]

    expect(head.x - tail.x).toBeCloseTo(MIN_TRAIL_PX, 3)
  })

  it("never draws a trail longer than the maximum, so a gale does not smear across the map", () => {
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]
    const gale = (MAX_TRAIL_PX / DEFAULT_TRAIL_SECONDS / PIXELS_PER_SECOND_PER_METRE_SECOND) * 10

    const [tail, head] = advanceFrame(particles, eastwardField(gale), view, size, FRAME_SECONDS, options)[0]

    expect(head.x - tail.x).toBeCloseTo(MAX_TRAIL_PX, 3)
  })

  it("lets a layer set its own trail limits", () => {
    const flow = 8
    const length = (limits: { minTrailPixels?: number; maxTrailPixels?: number }) => {
      const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]
      const [tail, head] = advanceFrame(particles, eastwardField(flow), view, size, FRAME_SECONDS, {
        ...options,
        ...limits,
      })[0]
      return head.x - tail.x
    }
    const unconstrained = expectedTrailPixels(flow)

    expect(length({})).toBeCloseTo(unconstrained, 1)
    // Limits either side of what it would have been bind it to them. (The minimum stays under
    // the default maximum, which would otherwise clamp it back down.)
    const betweenItAndTheMaximum = (unconstrained + MAX_TRAIL_PX) / 2
    expect(length({ maxTrailPixels: unconstrained / 2 })).toBeCloseTo(unconstrained / 2, 3)
    expect(length({ minTrailPixels: betweenItAndTheMaximum })).toBeCloseTo(betweenItAndTheMaximum, 3)
  })

  it("draws no trail for a particle that is not moving, rather than guessing a direction", () => {
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]

    expect(advanceFrame(particles, eastwardField(0), view, size, FRAME_SECONDS, options)).toHaveLength(0)
  })

  it("draws nothing for a particle that respawned this frame, rather than a streak across the map", () => {
    // Already past its lifetime, so this step respawns it somewhere else.
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 1e9 }]

    const segments = advanceFrame(particles, eastwardField(speed), view, size, FRAME_SECONDS, {
      ...options,
      random: () => 0.9,
    })

    expect(segments).toHaveLength(0)
  })

  it("moves a particle that is off the screen back onto it, instead of spending it out of sight", () => {
    // Inside the field (which spans -4.7 to -4.3) but nowhere near the screen once zoomed in.
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: -4.4, age: 0 }]
    const zoomedIn = { ...view, zoom: 14 }

    advanceFrame(particles, eastwardField(speed), zoomedIn, size, FRAME_SECONDS, options)

    const onScreen = visibleBounds(zoomedIn, size, AREA_PADDING_PX)
    expect(particles[0].longitude).toBeGreaterThanOrEqual(onScreen.west)
    expect(particles[0].longitude).toBeLessThanOrEqual(onScreen.east)
  })

  it("keeps all of its particles on the screen over time, however much bigger the field is", () => {
    // The field spans 0.4 degrees; at zoom 14 the screen shows well under 0.02 of it.
    const zoomedIn = { ...view, zoom: 14 }
    const field = eastwardField(speed)
    const count = 300
    const particles = seedParticles(field, zoomedIn, size, count)

    for (let frame = 0; frame < 120; frame++) {
      advanceFrame(particles, field, zoomedIn, size, FRAME_SECONDS, options)
    }

    const onScreen = visibleBounds(zoomedIn, size, AREA_PADDING_PX)
    expect(particles).toHaveLength(count)
    for (const particle of particles) {
      expect(particle.longitude).toBeGreaterThanOrEqual(onScreen.west)
      expect(particle.longitude).toBeLessThanOrEqual(onScreen.east)
      expect(particle.latitude).toBeGreaterThanOrEqual(onScreen.south)
      expect(particle.latitude).toBeLessThanOrEqual(onScreen.north)
    }
  })

  it("moves the particles themselves forward, so the next frame continues from here", () => {
    const particles: Particle[] = [{ latitude: CENTRE_LATITUDE, longitude: CENTRE_LONGITUDE, age: 0 }]

    advanceFrame(particles, eastwardField(speed), view, size, FRAME_SECONDS, options)

    expect(particles[0].longitude).toBeGreaterThan(CENTRE_LONGITUDE)
  })
})

// Web sizes the field by the viewport (leaflet-velocity: particles = viewport pixels *
// particleMultiplier), so the density a paddler sees does not depend on how big the
// day's forecast area happens to be. Mobile matches it.
describe("particleCountFor", () => {
  it("is the screen's pixel count times the multiplier", () => {
    expect(particleCountFor(size, MULTIPLIER)).toBe(Math.round(size.width * size.height * MULTIPLIER))
  })

  it("is zero for a screen with no size yet", () => {
    expect(particleCountFor({ width: 0, height: 0 }, MULTIPLIER)).toBe(0)
  })
})

describe("seedParticles", () => {
  it("seeds the requested number on the screen, not across the whole field", () => {
    const zoomedIn = { ...view, zoom: 14 }
    const count = 250

    const particles = seedParticles(eastwardField(4), zoomedIn, size, count)

    const onScreen = visibleBounds(zoomedIn, size, AREA_PADDING_PX)
    expect(particles).toHaveLength(count)
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
  const centre: [number, number] = [CENTRE_LATITUDE, CENTRE_LONGITUDE] // [latitude, longitude]
  const screenPixels = size.width * size.height
  const discPixels = (radiusKm: number) => Math.PI * (radiusKm * 1000 * pixelsPerMetre(view.zoom, CENTRE_LATITUDE)) ** 2

  it("is the disc's own area when it sits wholly on the screen", () => {
    const area = forecastAreaPixels(view, size, { center: centre, radiusKm: DISC_RADIUS_KM })

    expect(area / discPixels(DISC_RADIUS_KM)).toBeCloseTo(1, 1)
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
    const [longitude] = unprojectScreen(view, size, 0, centreY)

    const area = forecastAreaPixels(view, size, { center: [CENTRE_LATITUDE, longitude], radiusKm: DISC_RADIUS_KM })

    expect(area / discPixels(DISC_RADIUS_KM)).toBeCloseTo(0.5, 1)
  })

  it("falls to a quarter for every zoom level out, as the disc shrinks on screen", () => {
    const disc = { center: centre, radiusKm: DISC_RADIUS_KM }

    const near = forecastAreaPixels(view, size, disc)
    const far = forecastAreaPixels({ ...view, zoom: view.zoom - 1 }, size, disc)

    expect(far / near).toBeCloseTo(0.25, 1)
  })
})

describe("particleCountForForecast", () => {
  const disc = { center: [CENTRE_LATITUDE, CENTRE_LONGITUDE] as [number, number], radiusKm: DISC_RADIUS_KM }

  it("is the multiplier times the part of the screen the forecast covers", () => {
    const area = forecastAreaPixels(view, size, disc)

    expect(particleCountForForecast(view, size, disc, MULTIPLIER)).toBe(Math.round(area * MULTIPLIER))
  })

  it("thins out as the map zooms out, so the density on screen stays the same", () => {
    const near = particleCountForForecast(view, size, disc, MULTIPLIER)
    const far = particleCountForForecast({ ...view, zoom: view.zoom - 2 }, size, disc, MULTIPLIER)

    // Two zoom levels out is a sixteenth of the area on screen.
    expect(far).toBeLessThan(near / 10)
  })

  it("never asks for more than the whole screen would get", () => {
    const huge = { center: disc.center, radiusKm: 5000 }

    expect(particleCountForForecast(view, size, huge, MULTIPLIER)).toBeLessThanOrEqual(
      particleCountFor(size, MULTIPLIER),
    )
  })
})
