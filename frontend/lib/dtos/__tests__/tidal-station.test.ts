import { describe, it, expect } from "vitest"
import { TidalStreamEntrySchema, TidalStationSchema, TidalGateWarningSchema } from "../tidal-station"

const STREAM_ENTRY_FIXTURE = {
  stationId: "01952f1a-0000-7000-8000-000000000002",
  hoursFromHw: -3,
  directionDegrees: 270.0,
  springRateKnots: 2.1,
  neapRateKnots: 1.0,
}

const TIDAL_STATION_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000002",
  name: "Pentland Firth East",
  location: { type: "Point" as const, coordinates: [-3.1, 58.7] },
  source: "UKHO Chart 5011",
  notes: "Strong spring currents",
  meanSpringRangeM: 3.8,
  tidalStreamEntries: [STREAM_ENTRY_FIXTURE],
}

const TIDAL_GATE_WARNING_FIXTURE = {
  pointId: "01952f1a-0000-7000-8000-000000000010",
  stationName: "Pentland Firth East",
  rateKnots: 2.8,
  directionDegrees: 270.0,
  nextSlackUtc: "2026-06-08T11:30:00Z",
  isBlocking: true,
}

describe("TidalStreamEntrySchema", () => {
  it("parses a full stream entry fixture", () => {
    expect(TidalStreamEntrySchema.safeParse(STREAM_ENTRY_FIXTURE).success).toBe(true)
  })

  it("accepts null optional rate fields", () => {
    const result = TidalStreamEntrySchema.safeParse({
      ...STREAM_ENTRY_FIXTURE,
      directionDegrees: null,
      springRateKnots: null,
      neapRateKnots: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts absent stationId (dump_only)", () => {
    const { stationId: _, ...noStation } = STREAM_ENTRY_FIXTURE
    expect(TidalStreamEntrySchema.safeParse(noStation).success).toBe(true)
  })

  it("rejects missing hoursFromHw", () => {
    const { hoursFromHw: _, ...noHours } = STREAM_ENTRY_FIXTURE
    expect(TidalStreamEntrySchema.safeParse(noHours).success).toBe(false)
  })
})

describe("TidalStationSchema", () => {
  it("parses a full tidal station fixture", () => {
    expect(TidalStationSchema.safeParse(TIDAL_STATION_FIXTURE).success).toBe(true)
  })

  it("accepts null optional fields", () => {
    const result = TidalStationSchema.safeParse({
      ...TIDAL_STATION_FIXTURE,
      source: null,
      notes: null,
      meanSpringRangeM: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects wrong GeoJSON type", () => {
    const result = TidalStationSchema.safeParse({
      ...TIDAL_STATION_FIXTURE,
      location: { type: "LineString", coordinates: [[-3.1, 58.7], [-3.2, 58.8]] },
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing id", () => {
    const { id: _, ...noId } = TIDAL_STATION_FIXTURE
    expect(TidalStationSchema.safeParse(noId).success).toBe(false)
  })
})

describe("TidalGateWarningSchema", () => {
  it("parses a full tidal gate warning fixture", () => {
    expect(TidalGateWarningSchema.safeParse(TIDAL_GATE_WARNING_FIXTURE).success).toBe(true)
  })

  it("accepts null direction and slack fields", () => {
    const result = TidalGateWarningSchema.safeParse({
      ...TIDAL_GATE_WARNING_FIXTURE,
      directionDegrees: null,
      nextSlackUtc: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing isBlocking", () => {
    const { isBlocking: _, ...noBlocking } = TIDAL_GATE_WARNING_FIXTURE
    expect(TidalGateWarningSchema.safeParse(noBlocking).success).toBe(false)
  })

  it("rejects missing pointId", () => {
    const { pointId: _, ...noPoint } = TIDAL_GATE_WARNING_FIXTURE
    expect(TidalGateWarningSchema.safeParse(noPoint).success).toBe(false)
  })
})
