import type { VelocityField } from "../velocity"
import {
  DEFAULT_SPEED_PALETTE,
  createParticles,
  sampleField,
  speedColor,
  stepParticles,
} from "../advection"

// A 2x2 grid, 1 degree on a side: NW (north, west) to SE (south, east).
// u/v are indexed row-major from the NW corner: [NW, NE, SW, SE].
function uniformField(overrides: Partial<VelocityField> = {}): VelocityField {
  return {
    north: 1,
    south: 0,
    west: 0,
    east: 1,
    nx: 2,
    ny: 2,
    u: [2, 2, 2, 2],
    v: [3, 3, 3, 3],
    ...overrides,
  }
}

// A 3x3 grid, 2 degrees on a side, with only the NE-most grid point masked.
// A 2x2 grid can't represent partial masking meaningfully: with only one
// interpolation cell covering the whole bbox, every query touches all four
// corners, so masking any one of them masks the entire field. 3x3 gives a
// masked cell (touching the NE corner) and a genuinely unaffected one (SW).
function partiallyMaskedField(): VelocityField {
  return {
    north: 2,
    south: 0,
    west: 0,
    east: 2,
    nx: 3,
    ny: 3,
    // Row-major from the NW corner: [NW, N, NE(masked), W, mid, E, SW, S, SE].
    u: [2, 2, null, 2, 2, 2, 2, 2, 2],
    v: [3, 3, null, 3, 3, 3, 3, 3, 3],
  }
}

describe("sampleField", () => {
  it("returns the uniform value anywhere inside a uniform field", () => {
    expect(sampleField(uniformField(), 0.5, 0.5)).toEqual([2, 3])
    expect(sampleField(uniformField(), 0, 0)).toEqual([2, 3])
    expect(sampleField(uniformField(), 1, 1)).toEqual([2, 3])
  })

  it("interpolates bilinearly between four distinct corners", () => {
    // NW=0, NE=10, SW=0, SE=10 for u: a pure east-west gradient, so the
    // midpoint east-west (longitude 0.5) is 5 regardless of latitude.
    const field = uniformField({ u: [0, 10, 0, 10], v: [0, 0, 0, 0] })

    expect(sampleField(field, 0.5, 0.5)?.[0]).toBeCloseTo(5)
    expect(sampleField(field, 1, 0.5)?.[0]).toBeCloseTo(5)
    expect(sampleField(field, 0.5, 0.25)?.[0]).toBeCloseTo(2.5)
  })

  it("interpolates along the north-south axis the same way", () => {
    // NW=0, NE=0, SW=10, SE=10: a pure north-south gradient in v.
    const field = uniformField({ u: [0, 0, 0, 0], v: [0, 0, 10, 10] })

    // Halfway down (latitude 0.5, midway between north=1 and south=0).
    expect(sampleField(field, 0.5, 0.5)?.[1]).toBeCloseTo(5)
    // At the north edge, it's the NW/NE value.
    expect(sampleField(field, 1, 0.5)?.[1]).toBeCloseTo(0)
    // At the south edge, it's the SW/SE value.
    expect(sampleField(field, 0, 0.5)?.[1]).toBeCloseTo(10)
  })

  it("returns null outside the bounding box", () => {
    const field = uniformField()

    expect(sampleField(field, 2, 0.5)).toBeNull()
    expect(sampleField(field, -1, 0.5)).toBeNull()
    expect(sampleField(field, 0.5, 2)).toBeNull()
    expect(sampleField(field, 0.5, -1)).toBeNull()
  })

  it("returns null near a masked grid point, but stays sampleable away from it", () => {
    const field = partiallyMaskedField()

    // Near the masked NE corner: the interpolation box touches it.
    expect(sampleField(field, 1.5, 1.5)).toBeNull()
    // Far from it, in the SW area: the box never touches the masked point.
    expect(sampleField(field, 0.5, 0.5)).toEqual([2, 3])
  })

  it("handles a degenerate single-row or single-column grid without dividing by zero", () => {
    const oneRow: VelocityField = { north: 1, south: 1, west: 0, east: 1, nx: 2, ny: 1, u: [4, 6], v: [0, 0] }

    expect(sampleField(oneRow, 1, 0.5)?.[0]).toBeCloseTo(5)
  })
})

describe("createParticles", () => {
  it("creates the requested count, each inside the bbox", () => {
    const field = uniformField()
    const particles = createParticles(field, 20)

    expect(particles).toHaveLength(20)
    for (const particle of particles) {
      expect(particle.latitude).toBeGreaterThanOrEqual(field.south)
      expect(particle.latitude).toBeLessThanOrEqual(field.north)
      expect(particle.longitude).toBeGreaterThanOrEqual(field.west)
      expect(particle.longitude).toBeLessThanOrEqual(field.east)
    }
  })

  it("never seeds a particle on a masked cell", () => {
    const field = partiallyMaskedField()

    const particles = createParticles(field, 30)

    // Most of the field is sampleable, so all 30 should seed successfully —
    // proving the check actually runs, not just that it would pass vacuously.
    expect(particles).toHaveLength(30)
    for (const particle of particles) {
      expect(sampleField(field, particle.latitude, particle.longitude)).not.toBeNull()
    }
  })

  it("is seedable deterministically via the random argument", () => {
    const field = uniformField()
    const sequence = [0.1, 0.2, 0.9, 0.8, 0.5, 0.5]
    let i = 0
    const random = () => sequence[i++ % sequence.length]

    const particles = createParticles(field, 1, random)

    // randomSampleablePosition draws latitude first, then longitude.
    expect(particles[0].latitude).toBeCloseTo(field.south + 0.1 * (field.north - field.south))
    expect(particles[0].longitude).toBeCloseTo(field.west + 0.2 * (field.east - field.west))
  })

  it("starts every particle with a finite age", () => {
    const particles = createParticles(uniformField(), 10)

    for (const particle of particles) {
      expect(Number.isFinite(particle.age)).toBe(true)
      expect(particle.age).toBeGreaterThanOrEqual(0)
    }
  })

  it("returns fewer than requested rather than looping forever on an entirely masked field", () => {
    const field = uniformField({ u: [null, null, null, null], v: [null, null, null, null] })

    const particles = createParticles(field, 5)

    expect(particles).toHaveLength(0)
  })
})

describe("stepParticles", () => {
  it("advects a particle east when u is positive, unchanged in latitude for v=0", () => {
    const field = uniformField({ u: [5, 5, 5, 5], v: [0, 0, 0, 0] })
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 0 }]

    stepParticles(particles, field, 10)

    expect(particles[0].latitude).toBeCloseTo(0.5)
    expect(particles[0].longitude).toBeGreaterThan(0.5)
  })

  it("advects a particle north when v is positive", () => {
    const field = uniformField({ u: [0, 0, 0, 0], v: [5, 5, 5, 5] })
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 0 }]

    stepParticles(particles, field, 10)

    expect(particles[0].latitude).toBeGreaterThan(0.5)
    expect(particles[0].longitude).toBeCloseTo(0.5)
  })

  it("shrinks eastward displacement at higher latitudes (cos(latitude))", () => {
    const field: VelocityField = { north: 80, south: 0, west: -10, east: 10, nx: 2, ny: 2, u: [10, 10, 10, 10], v: [0, 0, 0, 0] }
    const nearEquator = [{ latitude: 1, longitude: 0, age: 0 }]
    const nearPole = [{ latitude: 79, longitude: 0, age: 0 }]

    // Small dt: large enough to see a difference, small enough to stay well
    // under the default maxAgeSeconds (a dt that alone exceeds it forces an
    // immediate random respawn, masking the thing this test checks).
    stepParticles(nearEquator, field, 10)
    stepParticles(nearPole, field, 10)

    const equatorDelta = nearEquator[0].longitude
    const poleDelta = nearPole[0].longitude
    expect(poleDelta).toBeGreaterThan(equatorDelta)
  })

  it("increments age by dtSeconds", () => {
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 3 }]

    stepParticles(particles, uniformField(), 2)

    expect(particles[0].age).toBeCloseTo(5)
  })

  it("respawns a particle once it exceeds maxAgeSeconds", () => {
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 59 }]

    stepParticles(particles, uniformField(), 2, { maxAgeSeconds: 60, random: () => 0.5 })

    expect(particles[0].age).toBeLessThan(1)
  })

  it("respawns a particle that has drifted outside the bbox", () => {
    const field = uniformField({ u: [1000, 1000, 1000, 1000] })
    const particles = [{ latitude: 0.5, longitude: 0.99, age: 0 }]

    // maxAgeSeconds set high so only the bounds check can trigger the
    // respawn this test is about — dt alone would otherwise exceed the
    // default maxAgeSeconds and respawn for that reason instead, passing
    // the assertion below without ever exercising the bounds check.
    stepParticles(particles, field, 100, { maxAgeSeconds: 1_000_000, random: () => 0.5 })

    expect(particles[0].longitude).toBeGreaterThanOrEqual(field.west)
    expect(particles[0].longitude).toBeLessThanOrEqual(field.east)
  })

  it("respawns a particle that drifts onto a masked cell", () => {
    const field = partiallyMaskedField()
    // Starts sampleable, well clear of the masked NE corner; u/v there (2, 3)
    // point straight at it, and a long enough dt overshoots into the cell
    // touching that masked point. maxAgeSeconds set high for the same
    // reason as the bbox-drift test above: isolate the mask check.
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 0 }]

    stepParticles(particles, field, 40_000, { maxAgeSeconds: 1_000_000, random: () => 0.1 })

    // Respawned somewhere sampleable, not stuck touching the masked point.
    expect(sampleField(field, particles[0].latitude, particles[0].longitude)).not.toBeNull()
  })

  it("mutates the particles in place and returns the same array", () => {
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 0 }]

    const result = stepParticles(particles, uniformField(), 1)

    expect(result).toBe(particles)
  })
})

// M35: a day's field can be far bigger than the screen. Spawning across all of it leaves
// most particles off-screen and the visible density a fraction of what was asked for, so
// callers can confine particles to the area actually being looked at.
describe("confining particles to an area", () => {
  const area = { north: 0.6, south: 0.4, west: 0.4, east: 0.6 }

  it("seeds every particle inside the area, not across the whole field", () => {
    const particles = createParticles(uniformField(), 200, Math.random, area)

    expect(particles).toHaveLength(200)
    for (const particle of particles) {
      expect(particle.latitude).toBeGreaterThanOrEqual(area.south)
      expect(particle.latitude).toBeLessThanOrEqual(area.north)
      expect(particle.longitude).toBeGreaterThanOrEqual(area.west)
      expect(particle.longitude).toBeLessThanOrEqual(area.east)
    }
  })

  it("only uses the part of the area that overlaps the field", () => {
    // Half of this area hangs off the field's east edge.
    const overhanging = { north: 0.6, south: 0.4, west: 0.9, east: 1.1 }

    const particles = createParticles(uniformField(), 100, Math.random, overhanging)

    expect(particles).toHaveLength(100)
    for (const particle of particles) {
      expect(particle.longitude).toBeLessThanOrEqual(1)
    }
  })

  it("seeds nothing when the area does not touch the field at all", () => {
    const elsewhere = { north: 11, south: 10, west: 10, east: 11 }

    expect(createParticles(uniformField(), 50, Math.random, elsewhere)).toEqual([])
  })

  it("respawns a particle that is inside the field but outside the area", () => {
    // In the field (0..1) and sampleable, but not inside the 0.4..0.6 area.
    const particles = [{ latitude: 0.9, longitude: 0.9, age: 0 }]

    stepParticles(particles, uniformField(), 0.001, { area, maxAgeSeconds: 1e9 })

    expect(particles[0].latitude).toBeGreaterThanOrEqual(area.south)
    expect(particles[0].latitude).toBeLessThanOrEqual(area.north)
    expect(particles[0].longitude).toBeGreaterThanOrEqual(area.west)
    expect(particles[0].longitude).toBeLessThanOrEqual(area.east)
    expect(particles[0].age).toBe(0)
  })

  it("leaves a particle that is inside the area to carry on", () => {
    const particles = [{ latitude: 0.5, longitude: 0.5, age: 0 }]

    stepParticles(particles, uniformField(), 0.001, { area, maxAgeSeconds: 1e9 })

    expect(particles[0].age).toBeCloseTo(0.001, 8)
    expect(particles[0].longitude).toBeGreaterThan(0.5)
  })
})

describe("speedColor", () => {
  it("returns the slowest stop's colour at or below its speed", () => {
    const [slowest] = DEFAULT_SPEED_PALETTE
    expect(speedColor(slowest.speed, DEFAULT_SPEED_PALETTE)).toBe(speedColor(0, DEFAULT_SPEED_PALETTE))
  })

  it("returns the fastest stop's colour at or above its speed", () => {
    const fastest = DEFAULT_SPEED_PALETTE[DEFAULT_SPEED_PALETTE.length - 1]
    expect(speedColor(fastest.speed, DEFAULT_SPEED_PALETTE)).toBe(speedColor(fastest.speed + 100, DEFAULT_SPEED_PALETTE))
  })

  it("interpolates between two stops", () => {
    const palette = [
      { speed: 0, color: [0, 0, 0] as const },
      { speed: 10, color: [200, 0, 0] as const },
    ]

    expect(speedColor(5, palette)).toBe("rgb(100, 0, 0)")
  })

  it("returns a valid rgb() string for the default palette", () => {
    expect(speedColor(6, DEFAULT_SPEED_PALETTE)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/)
  })
})
