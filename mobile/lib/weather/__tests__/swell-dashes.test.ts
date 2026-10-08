import { projectLngLat, visibleBounds, type MapViewState } from "../../map/project-lng-lat"
import {
  SWELL_CHAOS,
  SWELL_DASH_PIXELS,
  SWELL_LATERAL_WOBBLE_PIXELS,
  SWELL_LENGTH_VARIATION,
  SWELL_MAX_SPACING_PIXELS,
  SWELL_MIN_SPACING_PIXELS,
  SWELL_PHASE_JITTER,
  SWELL_POSITION_JITTER,
  SWELL_RATE_VARIATION,
  SWELL_SKIP_PROBABILITY,
  SWELL_STEP_PIXELS,
  SWELL_STEP_SECONDS,
  SWELL_STEP_VARIATION,
  SWELL_STEPS,
  SWELL_VISIBLE_PADDING_PIXELS,
  swellDashes as swellDashesWithChaos,
  swellLattice as swellLatticeWithChaos,
  type SwellNode,
} from "../swell-dashes"
import type { VelocityField } from "../velocity"

const size = { width: 400, height: 800 }
const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

// The geometry and timing tests below are about the regular pattern, so they run with chaos
// switched off. The randomness has its own tests at the end, which pass SWELL_CHAOS.
const STEADY = 0
const swellLattice = (
  latticeField: VelocityField,
  mapView: MapViewState,
  mapSize: { width: number; height: number },
) => swellLatticeWithChaos(latticeField, mapView, mapSize, STEADY)
const swellDashes = (
  nodes: SwellNode[],
  mapView: MapViewState,
  mapSize: { width: number; height: number },
  nowSeconds: number,
) => swellDashesWithChaos(nodes, mapView, mapSize, nowSeconds, STEADY)

// 5 x 5 data points over 0.1 degrees of latitude and 0.17 of longitude: about 2.8 km apart in
// both directions, which is about 62 px at zoom 10 — between the minimum and maximum spacing a
// node should have, so at this zoom the nodes are the data points themselves.
function field(overrides: Partial<VelocityField> = {}): VelocityField {
  return {
    north: 54.15,
    south: 54.05,
    west: -4.585,
    east: -4.415,
    nx: 5,
    ny: 5,
    u: new Array(25).fill(3),
    v: new Array(25).fill(0),
    ...overrides,
  }
}

function pixelDistance(a: SwellNode, b: SwellNode, mapView: MapViewState = view): number {
  const [ax, ay] = projectLngLat(mapView, size, a.longitude, a.latitude)
  const [bx, by] = projectLngLat(mapView, size, b.longitude, b.latitude)
  return Math.hypot(ax - bx, ay - by)
}

describe("swellLattice", () => {
  it("is the field's own data points when they are a comfortable distance apart on screen", () => {
    const nodes = swellLattice(field(), view, size)

    expect(nodes).toHaveLength(25)
    const longitudes = new Set(nodes.map((node) => Number(node.longitude.toFixed(6))))
    const latitudes = new Set(nodes.map((node) => Number(node.latitude.toFixed(6))))
    expect(longitudes.size).toBe(5)
    expect(latitudes.size).toBe(5)
    expect(Math.min(...longitudes)).toBeCloseTo(-4.585, 6)
    expect(Math.max(...longitudes)).toBeCloseTo(-4.415, 6)
    expect(Math.max(...latitudes)).toBeCloseTo(54.15, 6)
  })

  it("fills in between the data points when zoomed far in, so there is always something to see", () => {
    const zoomedIn: MapViewState = { ...view, zoom: 12 }

    const nodes = swellLattice(field(), zoomedIn, size)

    // The grid is ~250 px apart at zoom 12; nodes are subdivided until they are within range.
    const nearest = (node: SwellNode) =>
      Math.min(...nodes.filter((other) => other !== node).map((other) => pixelDistance(node, other, zoomedIn)))
    for (const node of nodes) {
      expect(nearest(node)).toBeLessThanOrEqual(SWELL_MAX_SPACING_PIXELS + 1e-6)
      expect(nearest(node)).toBeGreaterThanOrEqual(SWELL_MIN_SPACING_PIXELS - 1e-6)
    }
  })

  it("thins the data points out when zoomed far out, so they do not crowd into a blob", () => {
    const zoomedOut: MapViewState = { ...view, zoom: 8 }

    const nodes = swellLattice(field(), zoomedOut, size)

    expect(nodes.length).toBeLessThan(25)
    expect(nodes.length).toBeGreaterThan(0)
    const nearest = (node: SwellNode) =>
      Math.min(...nodes.filter((other) => other !== node).map((other) => pixelDistance(node, other, zoomedOut)))
    for (const node of nodes) {
      expect(nearest(node)).toBeGreaterThanOrEqual(SWELL_MIN_SPACING_PIXELS - 1e-6)
    }
  })

  it("never puts a dash on a masked data point", () => {
    const u = new Array<number | null>(25).fill(3)
    const v = new Array<number | null>(25).fill(0)
    u[12] = null
    v[12] = null

    const nodes = swellLattice(field({ u, v }), view, size)

    expect(nodes).toHaveLength(24)
  })

  it("leaves out data points that are not on the screen", () => {
    const farAway: MapViewState = { ...view, center: [10, 40] }

    expect(swellLattice(field(), farAway, size)).toEqual([])
  })

  it("only keeps nodes on or near the screen", () => {
    const zoomedIn: MapViewState = { ...view, zoom: 14 }
    const nodes = swellLattice(field(), zoomedIn, size)

    const bounds = visibleBounds(zoomedIn, size, SWELL_VISIBLE_PADDING_PIXELS)
    for (const node of nodes) {
      expect(node.longitude).toBeGreaterThanOrEqual(bounds.west)
      expect(node.longitude).toBeLessThanOrEqual(bounds.east)
      expect(node.latitude).toBeGreaterThanOrEqual(bounds.south)
      expect(node.latitude).toBeLessThanOrEqual(bounds.north)
    }
    expect(nodes.length).toBeGreaterThan(0)
  })

  it("is anchored to the field, so panning does not make the dashes swim", () => {
    const here = swellLattice(field(), view, size)
    const panned = swellLattice(field(), { ...view, center: [-4.49, 54.1] }, size)

    const key = (node: SwellNode) => `${node.latitude.toFixed(6)},${node.longitude.toFixed(6)}`
    const hereKeys = new Set(here.map(key))
    const shared = panned.filter((node) => hereKeys.has(key(node)))
    expect(shared.length).toBeGreaterThan(10)
  })

  it("gives a node no strength where the flow has faded out at the edge of the disc", () => {
    const u = new Array<number | null>(25).fill(3)
    u[0] = 0.3
    const v = new Array<number | null>(25).fill(0)

    const nodes = swellLattice(field({ u, v }), view, size)

    const strengths = nodes.map((node) => node.strength)
    expect(Math.max(...strengths)).toBeCloseTo(1, 6)
    expect(Math.min(...strengths)).toBeCloseTo(0.1, 6)
  })

  it("points each dash along the flow: east is right on a north-up map", () => {
    const [node] = swellLattice(field(), view, size)

    expect(node.direction.x).toBeCloseTo(1, 3)
    expect(node.direction.y).toBeCloseTo(0, 3)
  })

  it("turns the dashes with the map: facing east, an eastward flow runs up the screen", () => {
    const [node] = swellLattice(field(), { ...view, bearing: 90 }, size)

    expect(node.direction.x).toBeCloseTo(0, 3)
    expect(node.direction.y).toBeCloseTo(-1, 3)
  })

  it("offsets the phase from node to node along the flow, so the dashes ripple across the field", () => {
    const nodes = swellLattice(field(), view, size)

    const westmost = nodes.filter((node) => node.latitude === nodes[0].latitude).sort((a, b) => a.longitude - b.longitude)
    const phases = westmost.map((node) => node.phase)
    // Each step east moves the phase on by the same amount: one step's worth of the cycle, so a
    // dash at one node is one position ahead of the dash at the node behind it.
    const step = (phases[1] - phases[0] + 1) % 1
    expect(step).toBeCloseTo(1 / SWELL_STEPS, 6)
    expect((phases[2] - phases[1] + 1) % 1).toBeCloseTo(step, 6)
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(1)
    }
  })

  it("gives nodes the same phase across the flow, since a wave front is a line across it", () => {
    const nodes = swellLattice(field(), view, size)

    const sameLongitude = nodes.filter((node) => Math.abs(node.longitude - nodes[0].longitude) < 1e-9)
    const phases = sameLongitude.map((node) => node.phase)
    expect(sameLongitude.length).toBe(5)
    for (const phase of phases) expect(phase).toBeCloseTo(phases[0], 6)
  })
})

describe("swellDashes", () => {
  // One node on screen at the centre, flowing east, with no phase offset, so time alone decides.
  const node: SwellNode = {
    latitude: 54.1,
    longitude: -4.5,
    strength: 1,
    phase: 0,
    direction: { x: 1, y: 0 },
    seed: 12345,
    rate: 1,
  }
  const [centreX, centreY] = projectLngLat(view, size, -4.5, 54.1)

  // Seconds into the middle of the nth step of a node's cycle: its dash is at full strength.
  const middleOfStep = (step: number) => (step + 0.5) * SWELL_STEP_SECONDS

  it("shows one dash for a node, not a trail of them", () => {
    expect(swellDashes([node], view, size, middleOfStep(0))).toHaveLength(1)
  })

  it("shows one dash for each node", () => {
    const second: SwellNode = { ...node, longitude: -4.52 }

    expect(swellDashes([node, second], view, size, middleOfStep(0))).toHaveLength(2)
  })

  it("puts the dash on the node, across the flow, at the length asked for, in the first step", () => {
    const [dash] = swellDashes([node], view, size, middleOfStep(0))

    expect((dash.from.x + dash.to.x) / 2).toBeCloseTo(centreX, 3)
    expect((dash.from.y + dash.to.y) / 2).toBeCloseTo(centreY, 3)
    // East on a north-up map: the crest runs north to south, straight up and down the screen.
    expect(dash.to.x).toBeCloseTo(dash.from.x, 3)
    expect(Math.abs(dash.to.y - dash.from.y)).toBeCloseTo(SWELL_DASH_PIXELS, 3)
  })

  // A wave crest is a line square to the way the swell travels. Drawn along the flow it is a
  // streak, which is what wind looks like.
  it("draws every dash square to the flow, whichever way it runs", () => {
    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -0.6, y: 0.8 },
    ]

    for (const direction of directions) {
      const [dash] = swellDashes([{ ...node, direction }], view, size, middleOfStep(0))
      const along = (dash.to.x - dash.from.x) * direction.x + (dash.to.y - dash.from.y) * direction.y

      expect(along).toBeCloseTo(0, 6)
    }
  })

  it("is at full strength in the middle of a step and fading either side of it", () => {
    const [full] = swellDashes([node], view, size, middleOfStep(0))
    const [early] = swellDashes([node], view, size, 0.2 * SWELL_STEP_SECONDS)
    const [late] = swellDashes([node], view, size, 0.8 * SWELL_STEP_SECONDS)

    expect(full.alpha).toBeCloseTo(1, 6)
    expect(early.alpha).toBeLessThan(full.alpha)
    expect(late.alpha).toBeLessThan(full.alpha)
    expect(early.alpha).toBeCloseTo(late.alpha, 6)
  })

  it("fades in place: the dash does not move while it fades", () => {
    const [early] = swellDashes([node], view, size, 0.2 * SWELL_STEP_SECONDS)
    const [late] = swellDashes([node], view, size, 0.8 * SWELL_STEP_SECONDS)

    expect(early.from.x).toBeCloseTo(late.from.x, 6)
    expect(early.to.x).toBeCloseTo(late.to.x, 6)
  })

  it("has nothing showing at the instant one step ends and the next begins", () => {
    expect(swellDashes([node], view, size, SWELL_STEP_SECONDS)).toHaveLength(0)
  })

  it("puts the next dash a fixed distance further along the flow", () => {
    const [first] = swellDashes([node], view, size, middleOfStep(0))
    const [second] = swellDashes([node], view, size, middleOfStep(1))
    const [third] = swellDashes([node], view, size, middleOfStep(2))

    expect(second.from.x - first.from.x).toBeCloseTo(SWELL_STEP_PIXELS, 3)
    expect(third.from.x - second.from.x).toBeCloseTo(SWELL_STEP_PIXELS, 3)
    expect(second.from.y).toBeCloseTo(first.from.y, 3)
  })

  it("starts again from the node after the last step", () => {
    const [first] = swellDashes([node], view, size, middleOfStep(0))
    const [again] = swellDashes([node], view, size, middleOfStep(SWELL_STEPS))

    expect(again.from.x).toBeCloseTo(first.from.x, 6)
  })

  it("steps along the flow's own direction, whichever way it runs", () => {
    const north: SwellNode = { ...node, direction: { x: 0, y: -1 } }

    const [first] = swellDashes([north], view, size, middleOfStep(0))
    const [second] = swellDashes([north], view, size, middleOfStep(1))

    expect(second.from.x).toBeCloseTo(first.from.x, 3)
    expect(second.from.y - first.from.y).toBeCloseTo(-SWELL_STEP_PIXELS, 3)
  })

  it("offsets one node's cycle from another's by its phase, so they ripple", () => {
    const behind: SwellNode = { ...node, phase: 1 / SWELL_STEPS }

    const [a] = swellDashes([node], view, size, middleOfStep(0))
    const [b] = swellDashes([behind], view, size, middleOfStep(0))

    // A third of a cycle ahead is one step ahead: its dash is already one step along.
    expect(b.from.x - a.from.x).toBeCloseTo(SWELL_STEP_PIXELS, 3)
  })

  it("scales a dash's strength by its node's, so the flow fades out toward the rim", () => {
    const weak: SwellNode = { ...node, strength: 0.4 }

    const [dash] = swellDashes([weak], view, size, middleOfStep(0))

    expect(dash.alpha).toBeCloseTo(0.4, 6)
  })

  it("leaves out a dash that is off the screen", () => {
    const farAway: SwellNode = { ...node, longitude: 10, latitude: 40 }

    expect(swellDashes([farAway], view, size, middleOfStep(0))).toHaveLength(0)
  })

  it("follows the map when it is zoomed, because it projects fresh each frame", () => {
    const [near] = swellDashes([node], { ...view, zoom: 12 }, size, middleOfStep(0))

    // The node is the map centre at any zoom.
    expect((near.from.x + near.to.x) / 2).toBeCloseTo(centreX, 3)
  })
})

// A regular lattice blinking in step reads as a grid of lights, not as a sea. Randomness breaks
// it up: each point is nudged off its grid position, runs a little fast or slow and starts at
// its own moment, and every cycle each dash lands a little differently — or is skipped. It is
// deterministic (a hash of the point and the cycle, never Math.random), so it is the same on
// every frame and every pan, and one constant, SWELL_CHAOS, scales all of it.
describe("chaos: the lattice", () => {
  const steady = swellLatticeWithChaos(field(), view, size, STEADY)
  const chaotic = swellLatticeWithChaos(field(), view, size, SWELL_CHAOS)
  const gridStepLatitude = (54.15 - 54.05) / 4
  const gridStepLongitude = (-4.415 - -4.585) / 4
  const cyclicDistance = (a: number, b: number) => {
    const difference = Math.abs(a - b) % 1
    return Math.min(difference, 1 - difference)
  }

  it("is the same every time it is built, so the pattern does not reshuffle", () => {
    expect(swellLatticeWithChaos(field(), view, size, SWELL_CHAOS)).toEqual(chaotic)
  })

  it("keeps the same nodes, just moved: the count does not change", () => {
    expect(chaotic).toHaveLength(steady.length)
  })

  it("takes the nodes off the grid, so it no longer reads as rows and columns", () => {
    const moved = chaotic.filter(
      (node, index) =>
        Math.abs(node.latitude - steady[index].latitude) > 1e-9 || Math.abs(node.longitude - steady[index].longitude) > 1e-9,
    )

    expect(moved.length).toBeGreaterThan(steady.length * 0.8)
  })

  it("moves a node no further than the jitter allows, as a fraction of the node spacing", () => {
    chaotic.forEach((node, index) => {
      const latitudeShift = Math.abs(node.latitude - steady[index].latitude)
      const longitudeShift = Math.abs(node.longitude - steady[index].longitude)
      expect(latitudeShift).toBeLessThanOrEqual(SWELL_POSITION_JITTER * SWELL_CHAOS * gridStepLatitude + 1e-9)
      expect(longitudeShift).toBeLessThanOrEqual(SWELL_POSITION_JITTER * SWELL_CHAOS * gridStepLongitude + 1e-9)
    })
  })

  it("moves nodes every which way, not all in the same direction", () => {
    const shifts = chaotic.map((node, index) => node.longitude - steady[index].longitude)

    expect(shifts.some((shift) => shift > 1e-9)).toBe(true)
    expect(shifts.some((shift) => shift < -1e-9)).toBe(true)
  })

  it("moves them less with less chaos, and not at all with none", () => {
    const half = swellLatticeWithChaos(field(), view, size, SWELL_CHAOS / 2)
    // The middle node: unlike the ones on the field's edge, its jitter is never cut short.
    const middle = Math.floor(steady.length / 2)
    const shiftOf = (nodes: SwellNode[]) => nodes[middle].longitude - steady[middle].longitude

    expect(Math.abs(shiftOf(chaotic))).toBeGreaterThan(0)
    expect(shiftOf(half)).toBeCloseTo(shiftOf(chaotic) / 2, 9)
    expect(shiftOf(steady)).toBe(0)
  })

  it("keeps a node inside the field, however far the jitter would take it", () => {
    for (const node of chaotic) {
      expect(node.latitude).toBeGreaterThanOrEqual(54.05 - 1e-12)
      expect(node.latitude).toBeLessThanOrEqual(54.15 + 1e-12)
      expect(node.longitude).toBeGreaterThanOrEqual(-4.585 - 1e-12)
      expect(node.longitude).toBeLessThanOrEqual(-4.415 + 1e-12)
    }
  })

  it("puts each node's phase out by up to the phase jitter, on top of the ripple along the flow", () => {
    chaotic.forEach((node, index) => {
      expect(cyclicDistance(node.phase, steady[index].phase)).toBeLessThanOrEqual(SWELL_PHASE_JITTER * SWELL_CHAOS + 1e-9)
    })
    expect(chaotic.some((node, index) => cyclicDistance(node.phase, steady[index].phase) > 1e-9)).toBe(true)
  })

  it("gives nodes slightly different rates, within the variation", () => {
    const rates = chaotic.map((node) => node.rate)

    for (const rate of rates) {
      expect(rate).toBeGreaterThanOrEqual(1 - SWELL_RATE_VARIATION * SWELL_CHAOS - 1e-9)
      expect(rate).toBeLessThanOrEqual(1 + SWELL_RATE_VARIATION * SWELL_CHAOS + 1e-9)
    }
    expect(new Set(rates).size).toBeGreaterThan(1)
    expect(steady.every((node) => node.rate === 1)).toBe(true)
  })

  it("gives every node its own seed, so no two share a pattern", () => {
    expect(new Set(chaotic.map((node) => node.seed)).size).toBe(chaotic.length)
  })

  it("keeps a node's jitter when the map is panned, so the dashes do not swim", () => {
    const panned = swellLatticeWithChaos(field(), { ...view, center: [-4.49, 54.1] }, size, SWELL_CHAOS)

    const bySeed = new Map(chaotic.map((node) => [node.seed, node]))
    const shared = panned.filter((node) => bySeed.has(node.seed))
    expect(shared.length).toBeGreaterThan(10)
    for (const node of shared) {
      expect(node.latitude).toBe(bySeed.get(node.seed)?.latitude)
      expect(node.longitude).toBe(bySeed.get(node.seed)?.longitude)
      expect(node.phase).toBe(bySeed.get(node.seed)?.phase)
    }
  })
})

describe("chaos: the dashes", () => {
  const node: SwellNode = {
    latitude: 54.1,
    longitude: -4.5,
    strength: 1,
    phase: 0,
    direction: { x: 1, y: 0 },
    seed: 424242,
    rate: 1,
  }
  const [nodeX, nodeY] = projectLngLat(view, size, node.longitude, node.latitude)
  const cycleSeconds = SWELL_STEPS * SWELL_STEP_SECONDS
  const cycles = Array.from({ length: 200 }, (_, index) => index)
  // The middle of a step in a given cycle, where the dash is at full strength.
  const midStep = (cycle: number, step: number) => cycle * cycleSeconds + (step + 0.5) * SWELL_STEP_SECONDS
  const dashAt = (
    seconds: number,
    which: SwellNode = node,
    chaos = SWELL_CHAOS,
  ) => swellDashesWithChaos([which], view, size, seconds, chaos)[0]
  const centreOf = (dash: { from: { x: number; y: number }; to: { x: number; y: number } }) => ({
    x: (dash.from.x + dash.to.x) / 2,
    y: (dash.from.y + dash.to.y) / 2,
  })
  const lengthOf = (dash: { from: { x: number; y: number }; to: { x: number; y: number } }) =>
    Math.hypot(dash.to.x - dash.from.x, dash.to.y - dash.from.y)

  it("is the same every time for the same moment, so frames agree with each other", () => {
    expect(dashAt(midStep(7, 2))).toEqual(dashAt(midStep(7, 2)))
  })

  it("lands the first dash somewhere different each cycle, not on the same spot every time", () => {
    const spots = cycles
      .map((cycle) => dashAt(midStep(cycle, 0)))
      .filter((dash) => dash !== undefined)
      .map((dash) => `${centreOf(dash).x.toFixed(3)},${centreOf(dash).y.toFixed(3)}`)

    expect(new Set(spots).size).toBeGreaterThan(spots.length / 2)
  })

  it("keeps the first dash within the sideways wobble of its point", () => {
    for (const cycle of cycles) {
      const dash = dashAt(midStep(cycle, 0))
      if (!dash) continue
      const centre = centreOf(dash)
      expect(Math.hypot(centre.x - nodeX, centre.y - nodeY)).toBeLessThanOrEqual(
        SWELL_LATERAL_WOBBLE_PIXELS * SWELL_CHAOS + 1e-6,
      )
    }
  })

  it("varies how far apart the dashes are from one cycle to the next, within the allowed variation", () => {
    const steps: number[] = []
    for (const cycle of cycles) {
      const first = dashAt(midStep(cycle, 0))
      const second = dashAt(midStep(cycle, 1))
      if (!first || !second) continue
      steps.push(Math.hypot(centreOf(second).x - centreOf(first).x, centreOf(second).y - centreOf(first).y))
    }

    for (const step of steps) {
      expect(step).toBeGreaterThanOrEqual(SWELL_STEP_PIXELS * (1 - SWELL_STEP_VARIATION * SWELL_CHAOS) - 1e-6)
      expect(step).toBeLessThanOrEqual(SWELL_STEP_PIXELS * (1 + SWELL_STEP_VARIATION * SWELL_CHAOS) + 1e-6)
    }
    expect(Math.max(...steps) - Math.min(...steps)).toBeGreaterThan(SWELL_STEP_PIXELS * 0.1)
  })

  it("keeps the same step within one cycle, so a cycle is a regular march", () => {
    // A cycle that is showing at all: some are skipped.
    const cycle = cycles.find((candidate) => dashAt(midStep(candidate, 0)) !== undefined) ?? 0
    const centres = Array.from({ length: SWELL_STEPS }, (_, step) => dashAt(midStep(cycle, step))).map(centreOf)

    const gaps = centres.slice(1).map((centre, index) => Math.hypot(centre.x - centres[index].x, centre.y - centres[index].y))
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)
  })

  it("varies the length of the dash, within bounds", () => {
    const lengths = cycles
      .map((cycle) => dashAt(midStep(cycle, 0)))
      .filter((dash) => dash !== undefined)
      .map(lengthOf)

    for (const length of lengths) {
      expect(length).toBeGreaterThanOrEqual(SWELL_DASH_PIXELS * (1 - SWELL_LENGTH_VARIATION * SWELL_CHAOS) - 1e-6)
      expect(length).toBeLessThanOrEqual(SWELL_DASH_PIXELS * (1 + SWELL_LENGTH_VARIATION * SWELL_CHAOS) + 1e-6)
    }
    expect(new Set(lengths.map((length) => length.toFixed(3))).size).toBeGreaterThan(1)
  })

  // The irregularity is in where and when a dash appears. It is never in which way the swell
  // runs: a sea has one direction at a time, so every dash is square to it, in every cycle.
  it("keeps every dash square to the flow, in every cycle, however irregular the rest is", () => {
    const dashes = cycles
      .flatMap((cycle) => [0, 1, 2, 3].map((step) => dashAt(midStep(cycle, step))))
      .filter((dash) => dash !== undefined)

    expect(dashes.length).toBeGreaterThan(0)
    for (const dash of dashes) {
      const along = (dash.to.x - dash.from.x) * node.direction.x + (dash.to.y - dash.from.y) * node.direction.y
      expect(along).toBeCloseTo(0, 9)
    }
    const angles = new Set(dashes.map((dash) => Math.atan2(dash.to.y - dash.from.y, dash.to.x - dash.from.x).toFixed(6)))
    expect(angles.size).toBeLessThanOrEqual(2) // the two ends of one line: up or down the screen
  })

  it("skips some cycles altogether, about as often as the probability says", () => {
    const many = Array.from({ length: 1000 }, (_, index) => index)
    const skipped = many.filter((cycle) => dashAt(midStep(cycle, 0)) === undefined).length / many.length

    expect(skipped).toBeGreaterThan((SWELL_SKIP_PROBABILITY * SWELL_CHAOS) / 2)
    expect(skipped).toBeLessThan(SWELL_SKIP_PROBABILITY * SWELL_CHAOS * 2)
  })

  it("skips the whole cycle or none of it, not a dash here and there", () => {
    for (const cycle of cycles) {
      const showing = Array.from({ length: SWELL_STEPS }, (_, step) => dashAt(midStep(cycle, step)) !== undefined)
      expect(new Set(showing).size).toBe(1)
    }
  })

  it("keeps points with different seeds out of step with each other", () => {
    const other: SwellNode = { ...node, seed: node.seed + 1 }

    const differing = cycles.filter((cycle) => {
      const a = dashAt(midStep(cycle, 0), node)
      const b = dashAt(midStep(cycle, 0), other)
      return JSON.stringify(a) !== JSON.stringify(b)
    })

    expect(differing.length).toBeGreaterThan(cycles.length * 0.8)
  })

  it("lets a faster or slower rate carry a point through its cycle at a different pace", () => {
    // Compared without chaos, so no cycle is skipped: the rate alone decides where each point is.
    const fast: SwellNode = { ...node, rate: 1 + SWELL_RATE_VARIATION }
    const later = midStep(10, 0)

    expect(dashAt(later, fast, STEADY)?.alpha).toBeDefined()
    expect(dashAt(later, fast, STEADY)?.alpha).not.toBeCloseTo(dashAt(later, node, STEADY)?.alpha ?? NaN, 6)
  })

  it("does nothing different with no chaos: every cycle is the same regular march", () => {
    const first = dashAt(midStep(0, 0), node, STEADY)
    for (const cycle of cycles) {
      const dash = dashAt(midStep(cycle, 0), node, STEADY)
      expect(dash).toBeDefined()
      expect(dash?.from.x).toBeCloseTo(first.from.x, 6)
      expect(dash?.to.y).toBeCloseTo(first.to.y, 6)
    }
  })

  it("has less of everything with less chaos", () => {
    const wobble = (chaos: number) =>
      Math.max(
        ...cycles
          .map((cycle) => dashAt(midStep(cycle, 0), node, chaos))
          .filter((dash) => dash !== undefined)
          .map((dash) => Math.hypot(centreOf(dash).x - nodeX, centreOf(dash).y - nodeY)),
      )

    expect(wobble(SWELL_CHAOS / 2)).toBeLessThan(wobble(SWELL_CHAOS))
  })
})
