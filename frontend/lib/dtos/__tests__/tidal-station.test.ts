import { describe, it, expect } from "vitest"
import {
  TidalStreamEntrySchema,
  TidalStationSchema,
  TidalDiamondSchema,
  TidalGateWarningSchema,
  TidalDiamondFormSchema,
  TidalDiamondEditSchema,
  diamondEditToFormValues,
} from "../tidal-station"

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
      location: {
        type: "LineString",
        coordinates: [
          [-3.1, 58.7],
          [-3.2, 58.8],
        ],
      },
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing id", () => {
    const { id: _, ...noId } = TIDAL_STATION_FIXTURE
    expect(TidalStationSchema.safeParse(noId).success).toBe(false)
  })
})

const TIDAL_DIAMOND_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000020",
  name: "Race off the point",
  lat: 50.3,
  lng: -4.1,
  directionDegrees: 225.0,
  rateKnots: 1.8,
  source: "simple",
  radiusM: 500,
  isUserCreated: true,
  hourlyTable: [
    { hourFromHw: -1, rateKnots: 1.0, directionDegrees: 45.0 },
    { hourFromHw: 0, rateKnots: 1.0, directionDegrees: 225.0 },
    { hourFromHw: 3, rateKnots: 3.0, directionDegrees: 225.0 },
  ],
}

describe("TidalDiamondSchema", () => {
  it("parses a full tidal diamond fixture", () => {
    expect(TidalDiamondSchema.safeParse(TIDAL_DIAMOND_FIXTURE).success).toBe(true)
  })

  it("accepts a null resolved rate/direction (no data at the requested hour)", () => {
    const result = TidalDiamondSchema.safeParse({
      ...TIDAL_DIAMOND_FIXTURE,
      directionDegrees: null,
      rateKnots: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts an absent radius and source", () => {
    const { radiusM: _r, source: _s, ...minimal } = TIDAL_DIAMOND_FIXTURE
    expect(TidalDiamondSchema.safeParse(minimal).success).toBe(true)
  })

  it("rejects a missing isUserCreated flag", () => {
    const { isUserCreated: _, ...noFlag } = TIDAL_DIAMOND_FIXTURE
    expect(TidalDiamondSchema.safeParse(noFlag).success).toBe(false)
  })

  it("rejects a missing hourlyTable", () => {
    const { hourlyTable: _, ...noTable } = TIDAL_DIAMOND_FIXTURE
    expect(TidalDiamondSchema.safeParse(noTable).success).toBe(false)
  })
})

describe("TidalDiamondFormSchema", () => {
  const SIMPLE = {
    name: "The Race",
    entryMode: "simple" as const,
    radiusM: 500,
    maxSpringRateKnots: 3.0,
    maxNeapRateKnots: 1.5,
    floodDirectionDegrees: 45,
    ebbDirectionDegrees: 225,
  }

  it("accepts a complete simple-mode entry", () => {
    expect(TidalDiamondFormSchema.safeParse(SIMPLE).success).toBe(true)
  })

  it("rejects simple mode missing the peak rate", () => {
    const result = TidalDiamondFormSchema.safeParse({ ...SIMPLE, maxSpringRateKnots: null })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "maxSpringRateKnots")).toBe(true)
    }
  })

  it("rejects simple mode missing a stream direction", () => {
    const result = TidalDiamondFormSchema.safeParse({ ...SIMPLE, floodDirectionDegrees: null })
    expect(result.success).toBe(false)
  })

  it("rejects an empty name", () => {
    expect(TidalDiamondFormSchema.safeParse({ ...SIMPLE, name: "  " }).success).toBe(false)
  })

  it("rejects a direction outside 0–360", () => {
    expect(
      TidalDiamondFormSchema.safeParse({ ...SIMPLE, floodDirectionDegrees: 400 }).success,
    ).toBe(false)
  })

  it("accepts an atlas entry with at least one hourly rate", () => {
    const result = TidalDiamondFormSchema.safeParse({
      name: "Atlas point",
      entryMode: "atlas",
      tidalStreamEntries: [
        { hoursFromHw: -3, directionDegrees: 90, springRateKnots: 2.0, neapRateKnots: 1.0 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an atlas entry with no rates entered", () => {
    const result = TidalDiamondFormSchema.safeParse({
      name: "Atlas point",
      entryMode: "atlas",
      tidalStreamEntries: [
        { hoursFromHw: -3, directionDegrees: null, springRateKnots: null, neapRateKnots: null },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("TidalDiamondEditSchema + diamondEditToFormValues", () => {
  const SIMPLE_EDIT = {
    id: "01952f1a-0000-7000-8000-000000000020",
    name: "The Race",
    entryMode: "simple" as const,
    radiusM: 800,
    isUserCreated: true,
    maxSpringRateKnots: 3.0,
    maxNeapRateKnots: null,
    floodDirectionDegrees: 45,
    ebbDirectionDegrees: 225,
    tidalStreamEntries: [
      { hoursFromHw: -3, directionDegrees: 45, springRateKnots: 3.0, neapRateKnots: 3.0 },
    ],
  }

  it("parses the raw edit view", () => {
    expect(TidalDiamondEditSchema.safeParse(SIMPLE_EDIT).success).toBe(true)
  })

  it("maps simple peaks and pads the table to the full -6…+6 grid", () => {
    const values = diamondEditToFormValues(SIMPLE_EDIT)
    expect(values.name).toBe("The Race")
    expect(values.entryMode).toBe("simple")
    expect(values.radiusM).toBe(800)
    expect(values.maxSpringRateKnots).toBe(3.0)
    expect(values.maxNeapRateKnots).toBeNull()
    expect(values.floodDirectionDegrees).toBe(45)
    // Always 13 rows even though only one was stored; the stored hour is filled.
    expect(values.tidalStreamEntries).toHaveLength(13)
    const minus3 = values.tidalStreamEntries!.find((e) => e.hoursFromHw === -3)
    expect(minus3?.springRateKnots).toBe(3.0)
    const plus5 = values.tidalStreamEntries!.find((e) => e.hoursFromHw === 5)
    expect(plus5?.springRateKnots).toBeNull()
  })

  it("defaults radius to 500 when the diamond carries none", () => {
    const values = diamondEditToFormValues({ ...SIMPLE_EDIT, radiusM: null })
    expect(values.radiusM).toBe(500)
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
