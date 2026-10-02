import { projectLngLat, visibleBounds, type MapViewState } from "../../map/project-lng-lat"
import {
  SWELL_DASH_PIXELS,
  SWELL_STEP_PIXELS,
  SWELL_STEP_SECONDS,
  SWELL_STEPS,
  swellDashes,
  swellLattice,
  type SwellNode,
} from "../swell-dashes"
import type { VelocityField } from "../velocity"

const size = { width: 400, height: 800 }
const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

// 5 x 5 data points over 0.1 degrees of latitude and 0.17 of longitude: about 2.8 km apart in
// both directions, which is about 62 px at zoom 10 — inside the 36-72 px a node should have.
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

    // The grid is ~250 px apart at zoom 12; nodes are subdivided until they are 36-72 px apart.
    const nearest = (node: SwellNode) =>
      Math.min(...nodes.filter((other) => other !== node).map((other) => pixelDistance(node, other, zoomedIn)))
    for (const node of nodes) {
      expect(nearest(node)).toBeLessThanOrEqual(72 + 1e-6)
      expect(nearest(node)).toBeGreaterThanOrEqual(36 - 1e-6)
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
      expect(nearest(node)).toBeGreaterThanOrEqual(36 - 1e-6)
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

    const bounds = visibleBounds(zoomedIn, size, 80)
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
    // Each step east moves the phase on by the same amount (a third of a cycle at this spacing).
    const step = (phases[1] - phases[0] + 1) % 1
    expect(step).toBeGreaterThan(0.2)
    expect(step).toBeLessThan(0.5)
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
  const node: SwellNode = { latitude: 54.1, longitude: -4.5, strength: 1, phase: 0, direction: { x: 1, y: 0 } }
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

  it("puts the dash on the node, along the flow, at the length asked for, in the first step", () => {
    const [dash] = swellDashes([node], view, size, middleOfStep(0))

    expect((dash.from.x + dash.to.x) / 2).toBeCloseTo(centreX, 3)
    expect((dash.from.y + dash.to.y) / 2).toBeCloseTo(centreY, 3)
    expect(dash.to.x - dash.from.x).toBeCloseTo(SWELL_DASH_PIXELS, 3)
    expect(dash.to.y).toBeCloseTo(dash.from.y, 3)
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
