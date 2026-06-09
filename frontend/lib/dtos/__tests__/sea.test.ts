import { describe, it, expect } from "vitest"
import { SeaStateSchema, SeaSchema, RuleOfTwelfthsEntrySchema } from "../sea"

const SEA_STATE_FIXTURE = {
  dayId: "01952f1a-0000-7000-8000-000000000001",
  time: "10:00:00",
  waveHeight: 1.2,
  waveDirection: 180.0,
  swellDirection: 200.0,
  swellPeriod: 8.0,
  currentSpeed: null,
  currentDirection: null,
}

const ROT_ENTRY_FIXTURE = {
  hourFromLw: 0,
  cumulativeFraction: 0.0,
  estimatedHeightM: 0.0,
}

const SEA_FIXTURE = {
  dayId: "01952f1a-0000-7000-8000-000000000001",
  moonPhase: "waning gibbous",
  highTide: "09:00",
  lowTide: "15:00",
  tidalRangeM: 3.5,
  referencePortName: "Milford Haven",
  hwTimeOffsetMinutes: 35,
  lwTimeOffsetMinutes: 30,
  hwHeightRatio: 0.95,
  lwHeightRatio: 1.05,
  tidalSource: "manual_corrected",
  floodDirectionDegrees: 47,
  ebbDirectionDegrees: 227,
  maxSpringRateKnots: 3.1,
  maxNeapRateKnots: 1.6,
  seaStates: [SEA_STATE_FIXTURE],
  recordedAt: "2026-06-08T10:00:00",
  ruleOfTwelfths: [ROT_ENTRY_FIXTURE],
}

describe("SeaStateSchema", () => {
  it("parses a full sea state fixture", () => {
    expect(SeaStateSchema.safeParse(SEA_STATE_FIXTURE).success).toBe(true)
  })

  it("accepts null current fields", () => {
    expect(SeaStateSchema.safeParse({ ...SEA_STATE_FIXTURE, currentSpeed: null, currentDirection: null }).success).toBe(true)
  })

  it("accepts absent current fields", () => {
    const { currentSpeed: _, currentDirection: __, ...noCurrents } = SEA_STATE_FIXTURE
    expect(SeaStateSchema.safeParse(noCurrents).success).toBe(true)
  })

  it("rejects missing waveHeight", () => {
    const { waveHeight: _, ...noWave } = SEA_STATE_FIXTURE
    expect(SeaStateSchema.safeParse(noWave).success).toBe(false)
  })
})

describe("RuleOfTwelfthsEntrySchema", () => {
  it("parses a rule-of-twelfths entry", () => {
    expect(RuleOfTwelfthsEntrySchema.safeParse(ROT_ENTRY_FIXTURE).success).toBe(true)
  })

  it("rejects missing hourFromLw", () => {
    const { hourFromLw: _, ...noHour } = ROT_ENTRY_FIXTURE
    expect(RuleOfTwelfthsEntrySchema.safeParse(noHour).success).toBe(false)
  })
})

describe("SeaSchema", () => {
  it("parses a full sea fixture including tidal operability fields", () => {
    expect(SeaSchema.safeParse(SEA_FIXTURE).success).toBe(true)
  })

  it("accepts absent optional fields (minimum valid)", () => {
    expect(SeaSchema.safeParse({ dayId: SEA_FIXTURE.dayId }).success).toBe(true)
  })

  it("accepts null on all nullable tidal fields", () => {
    const result = SeaSchema.safeParse({
      ...SEA_FIXTURE,
      moonPhase: null,
      highTide: null,
      lowTide: null,
      tidalRangeM: null,
      referencePortName: null,
      hwTimeOffsetMinutes: null,
      lwTimeOffsetMinutes: null,
      hwHeightRatio: null,
      lwHeightRatio: null,
      floodDirectionDegrees: null,
      ebbDirectionDegrees: null,
      maxSpringRateKnots: null,
      maxNeapRateKnots: null,
      ruleOfTwelfths: null,
    })
    expect(result.success).toBe(true)
  })

  it("parses tidalSource as a string", () => {
    const result = SeaSchema.safeParse({ ...SEA_FIXTURE, tidalSource: "manual" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tidalSource).toBe("manual")
  })

  it("parses stream direction and rate fields", () => {
    const result = SeaSchema.safeParse(SEA_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.floodDirectionDegrees).toBe(47)
      expect(result.data.ebbDirectionDegrees).toBe(227)
      expect(result.data.maxSpringRateKnots).toBe(3.1)
      expect(result.data.maxNeapRateKnots).toBe(1.6)
    }
  })

  it("rejects missing dayId", () => {
    const { dayId: _, ...noDayId } = SEA_FIXTURE
    expect(SeaSchema.safeParse(noDayId).success).toBe(false)
  })
})
