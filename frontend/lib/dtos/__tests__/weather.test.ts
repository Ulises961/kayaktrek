import { describe, it, expect } from "vitest"
import { WeatherStateSchema, WeatherSchema } from "../weather"

const WEATHER_STATE_FIXTURE = {
  dayId: "01952f1a-0000-7000-8000-000000000001",
  time: "12:00:00",
  temperature: 15.0,
  precipitation: 0.0,
  windDirection: 180.0,
  windForce: 12.0,
  cloud: "few",
}

const WEATHER_FIXTURE = {
  dayId: "01952f1a-0000-7000-8000-000000000001",
  model: "ECMWF_IFS025",
  weatherStates: [WEATHER_STATE_FIXTURE],
}

describe("WeatherStateSchema", () => {
  it("parses a full weather state fixture", () => {
    expect(WeatherStateSchema.safeParse(WEATHER_STATE_FIXTURE).success).toBe(true)
  })

  it("accepts null optional fields", () => {
    const result = WeatherStateSchema.safeParse({
      ...WEATHER_STATE_FIXTURE,
      temperature: null,
      precipitation: null,
      windDirection: null,
      windForce: null,
      cloud: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing dayId", () => {
    const { dayId: _, ...noDayId } = WEATHER_STATE_FIXTURE
    expect(WeatherStateSchema.safeParse(noDayId).success).toBe(false)
  })

  it("rejects missing time", () => {
    const { time: _, ...noTime } = WEATHER_STATE_FIXTURE
    expect(WeatherStateSchema.safeParse(noTime).success).toBe(false)
  })
})

describe("WeatherSchema", () => {
  it("parses a full weather fixture", () => {
    expect(WeatherSchema.safeParse(WEATHER_FIXTURE).success).toBe(true)
  })

  it("accepts null model", () => {
    expect(WeatherSchema.safeParse({ ...WEATHER_FIXTURE, model: null }).success).toBe(true)
  })

  it("accepts absent weatherStates", () => {
    const { weatherStates: _, ...noStates } = WEATHER_FIXTURE
    expect(WeatherSchema.safeParse(noStates).success).toBe(true)
  })

  it("rejects missing dayId", () => {
    const { dayId: _, ...noDayId } = WEATHER_FIXTURE
    expect(WeatherSchema.safeParse(noDayId).success).toBe(false)
  })
})
