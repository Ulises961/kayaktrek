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
  it("parses a full sea fixture", () => {
    expect(SeaSchema.safeParse(SEA_FIXTURE).success).toBe(true)
  })

  it("accepts absent optional fields", () => {
    const result = SeaSchema.safeParse({ dayId: SEA_FIXTURE.dayId })
    expect(result.success).toBe(true)
  })

  it("accepts null tidal fields", () => {
    const result = SeaSchema.safeParse({
      ...SEA_FIXTURE,
      moonPhase: null,
      highTide: null,
      lowTide: null,
      tidalRangeM: null,
      ruleOfTwelfths: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing dayId", () => {
    const { dayId: _, ...noDayId } = SEA_FIXTURE
    expect(SeaSchema.safeParse(noDayId).success).toBe(false)
  })
})
