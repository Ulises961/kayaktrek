import { expandVelocityField, type VelocityDayRow, type VelocityHourRow } from "../velocity-descriptor"

// What the pull carries for a day (backend/Services/mobile_sync_service.py): a box, a grid size
// and a land mask, and per hour the wind and wave flow. Expanded here into the field the
// endpoints return, so the overlay draws the same thing with or without a connection.
const day: VelocityDayRow = {
  south: 53.5,
  north: 54.7,
  west: -5.2,
  east: -3.8,
  size: 2,
  // North-west, north-east, south-west, south-east: the south-west cell is land.
  landMask: "0010",
}
const hour: VelocityHourRow = { windU: -10, windV: 0.5, waveU: -0.68404, waveV: -1.87938 }

describe("expandVelocityField", () => {
  it("stamps the wind flow over every cell of the day's box", () => {
    const field = expandVelocityField(day, hour, "wind")

    expect(field).toEqual({
      north: 54.7,
      south: 53.5,
      west: -5.2,
      east: -3.8,
      nx: 2,
      ny: 2,
      u: [-10, -10, -10, -10],
      v: [0.5, 0.5, 0.5, 0.5],
    })
  })

  it("does not mask land for wind, which blows over it", () => {
    const field = expandVelocityField(day, hour, "wind")

    expect(field?.u).not.toContain(null)
  })

  it("nulls the land cells for waves, in both components, in the order the grid is stored", () => {
    const field = expandVelocityField(day, hour, "wave")

    expect(field?.u).toEqual([-0.68404, -0.68404, null, -0.68404])
    expect(field?.v).toEqual([-1.87938, -1.87938, null, -1.87938])
  })

  it("is null when the day has no flow for that layer at that hour, which is not an error", () => {
    expect(expandVelocityField(day, { ...hour, waveU: null, waveV: null }, "wave")).toBeNull()
    expect(expandVelocityField(day, { ...hour, windU: null }, "wind")).toBeNull()
    expect(expandVelocityField(day, { ...hour, windV: null }, "wind")).toBeNull()
  })

  it("answers for wind when only waves are missing, and the other way round", () => {
    const noWaves = { ...hour, waveU: null, waveV: null }

    expect(expandVelocityField(day, noWaves, "wind")).not.toBeNull()
    expect(expandVelocityField(day, { ...hour, windU: null, windV: null }, "wave")).not.toBeNull()
  })

  it("refuses a land mask that does not fit the grid, rather than drawing a misaligned coast", () => {
    expect(() => expandVelocityField({ ...day, landMask: "001" }, hour, "wave")).toThrow(/damaged/i)
    expect(() => expandVelocityField({ ...day, landMask: "00100" }, hour, "wind")).toThrow(/damaged/i)
  })

  it("builds a grid of the server's size, 24 by 24, from a full-size mask", () => {
    const size = 24
    const landMask = "1".repeat(size) + "0".repeat(size * size - size)

    const field = expandVelocityField({ ...day, size, landMask }, hour, "wave")

    expect([field?.nx, field?.ny, field?.u.length]).toEqual([size, size, size * size])
    expect(field?.u.slice(0, size).every((cell) => cell === null)).toBe(true)
    expect(field?.u.slice(size).every((cell) => cell === -0.68404)).toBe(true)
  })
})
