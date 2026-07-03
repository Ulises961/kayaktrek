import { describe, it, expect } from "vitest"
import { discCell, maskGridToDisc } from "@/lib/landing/ambient-wind"
import type { VelocityGridLayer } from "@/lib/types/ui"

// A 3×3 grid over a 2°×2° bbox centred on (0,0). Cell centres land on the
// integer lat/lon lattice from (1,-1) at the NW corner to (-1,1) at the SE.
function uniformGrid(value: number | null): VelocityGridLayer[] {
  const header = {
    parameterUnit: "m.s-1",
    parameterCategory: 2,
    parameterNumber: 2,
    parameterNumberName: "eastward_wind",
    la1: 1,
    la2: -1,
    lo1: -1,
    lo2: 1,
    nx: 3,
    ny: 3,
    dx: 1,
    dy: 1,
  }
  return [{ header, data: Array<number | null>(9).fill(value) }]
}

describe("discCell", () => {
  it("returns a Mediterranean fallback disc for an empty route", () => {
    const cell = discCell([])
    expect(cell.radiusKm).toBe(70)
    expect(cell.center[0]).toBeGreaterThan(39)
    expect(cell.center[0]).toBeLessThan(44)
  })

  it("centres on a single point with the floor radius", () => {
    const cell = discCell([[50.3, -4.1]])
    expect(cell.center).toEqual([50.3, -4.1])
    expect(cell.radiusKm).toBe(38)
  })

  it("grows the radius to contain a spread-out route", () => {
    const cell = discCell([
      [50, -5],
      [51, -3],
    ])
    expect(cell.center).toEqual([50.5, -4])
    expect(cell.radiusKm).toBeGreaterThan(38)
  })
})

describe("maskGridToDisc", () => {
  it("keeps the centre cell and nulls cells beyond the radius", () => {
    const [layer] = maskGridToDisc(uniformGrid(5), [0, 0], 80)
    expect(layer.data[4]).toBe(5) // centre, full strength (fade = 1)
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) {
      expect(layer.data[i]).toBeNull()
    }
  })

  it("fades cells inside the soft rim", () => {
    const [layer] = maskGridToDisc(uniformGrid(5), [0, 0], 130)
    const edge = layer.data[1] as number // (1,0), ~111 km out → within the rim
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(5)
    expect(layer.data[2]).toBeNull() // corner (1,1) is beyond the radius
  })

  it("preserves cells already nulled by the backend land mask", () => {
    const grid = uniformGrid(5)
    grid[0].data[4] = null // centre pre-nulled (land)
    const [layer] = maskGridToDisc(grid, [0, 0], 80)
    expect(layer.data[4]).toBeNull()
  })
})
