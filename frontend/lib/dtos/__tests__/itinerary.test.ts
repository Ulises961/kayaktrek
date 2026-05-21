import { describe, it, expect } from "vitest"
import { DaySchema, DaysSchema } from "../day"
import { ItinerarySchema } from "../itinerary"
import { PointSchema } from "../point"

const POINT_ID_1 = "01952f1a-0000-7000-8000-000000000001"
const POINT_ID_2 = "01952f1a-0000-7000-8000-000000000002"
const DAY_ID = "01952f1a-0000-7000-8000-000000000010"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000020"
const TRIP_ID = "01952f1a-0000-7000-8000-000000000030"
const USER_ID = "01952f1a-0000-7000-8000-000000000040"

const WEATHER_FIXTURE = {
  dayId: DAY_ID,
  model: "icon_seamless",
  weatherStates: [
    {
      dayId: DAY_ID,
      time: "08:00:00",
      temperature: 22.5,
      precipitation: 0,
      windDirection: 270,
      windForce: 12,
      cloud: "few",
    },
  ],
}

const SEA_FIXTURE = {
  dayId: DAY_ID,
  moonPhase: "waxing_crescent",
  highTide: "10:30",
  lowTide: "16:45",
  seaStates: [
    {
      dayId: DAY_ID,
      time: "09:00:00",
      waveHeight: 0.8,
      waveDirection: 260,
      swellDirection: 255,
      swellPeriod: 6,
    },
  ],
}

const POINT_FIXTURE = {
  id: POINT_ID_1,
  type: "stop",
  latitude: 41.38,
  longitude: 2.18,
  notes: "Overnight at the cove",
  name: "Cala Figuera",
  dayId: DAY_ID,
  images: [],
}

const DAY_FIXTURE = {
  id: DAY_ID,
  dayNumber: 1,
  itineraryId: ITINERARY_ID,
  date: "2026-07-01",
  startPointId: POINT_ID_1,
  endPointId: POINT_ID_2,
  points: [POINT_FIXTURE],
  weather: WEATHER_FIXTURE,
  sea: SEA_FIXTURE,
}

const ITINERARY_FIXTURE = {
  id: ITINERARY_ID,
  isPublic: false,
  totalMiles: 42.5,
  expectedTotalMiles: 45.0,
  tripId: TRIP_ID,
  userId: USER_ID,
  days: [DAY_FIXTURE],
}

describe("PointSchema", () => {
  it("parses a point with a name", () => {
    const result = PointSchema.safeParse(POINT_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe("Cala Figuera")
  })

  it("rejects a point name containing HTML tags", () => {
    const result = PointSchema.safeParse({ ...POINT_FIXTURE, name: "<script>alert(1)</script>" })
    expect(result.success).toBe(false)
  })

  it("accepts a point without a name", () => {
    const { name: _, ...noName } = POINT_FIXTURE
    const result = PointSchema.safeParse(noName)
    expect(result.success).toBe(true)
  })

  it("parses a self-referencing point (next)", () => {
    const pointWithNext = { ...POINT_FIXTURE, next: { ...POINT_FIXTURE, id: POINT_ID_2 } }
    const result = PointSchema.safeParse(pointWithNext)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.next?.id).toBe(POINT_ID_2)
  })
})

describe("DaySchema", () => {
  it("parses a full day fixture including startPointId and endPointId", () => {
    const result = DaySchema.safeParse(DAY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startPointId).toBe(POINT_ID_1)
      expect(result.data.endPointId).toBe(POINT_ID_2)
    }
  })

  it("accepts a day without startPointId and endPointId", () => {
    const { startPointId: _s, endPointId: _e, ...minimal } = DAY_FIXTURE
    const result = DaySchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startPointId).toBeUndefined()
      expect(result.data.endPointId).toBeUndefined()
    }
  })

  it("accepts a day with null startPointId and endPointId", () => {
    const result = DaySchema.safeParse({ ...DAY_FIXTURE, startPointId: null, endPointId: null })
    expect(result.success).toBe(true)
  })

  it("accepts a day with a null date", () => {
    const result = DaySchema.safeParse({ ...DAY_FIXTURE, date: null })
    expect(result.success).toBe(true)
  })

  it("parses weather stub nested in day", () => {
    const result = DaySchema.safeParse(DAY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.weather?.model).toBe("icon_seamless")
      expect(result.data.weather?.weatherStates).toHaveLength(1)
    }
  })

  it("parses sea stub nested in day", () => {
    const result = DaySchema.safeParse(DAY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sea?.moonPhase).toBe("waxing_crescent")
      expect(result.data.sea?.seaStates).toHaveLength(1)
    }
  })

  it("accepts a day without weather and sea", () => {
    const { weather: _w, sea: _s, ...noWeatherSea } = DAY_FIXTURE
    const result = DaySchema.safeParse(noWeatherSea)
    expect(result.success).toBe(true)
  })
})

describe("DaySchema — Day 0 (staging area)", () => {
  it("accepts dayNumber 0", () => {
    const result = DaySchema.safeParse({ ...DAY_FIXTURE, dayNumber: 0, date: null })
    expect(result.success).toBe(true)
  })

  it("rejects a negative dayNumber", () => {
    const result = DaySchema.safeParse({ ...DAY_FIXTURE, dayNumber: -1 })
    expect(result.success).toBe(false)
  })
})

describe("ItinerarySchema", () => {
  it("parses a full itinerary fixture", () => {
    const result = ItinerarySchema.safeParse(ITINERARY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.days).toHaveLength(1)
      expect(result.data.days?.[0].startPointId).toBe(POINT_ID_1)
    }
  })

  it("accepts an itinerary without days", () => {
    const { days: _, ...noDays } = ITINERARY_FIXTURE
    const result = ItinerarySchema.safeParse(noDays)
    expect(result.success).toBe(true)
  })
})
