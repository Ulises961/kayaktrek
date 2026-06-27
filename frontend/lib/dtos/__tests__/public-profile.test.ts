import { describe, it, expect } from "vitest"
import { StatsSchema, PublicUserSchema } from "../public-profile"

const STATS_FIXTURE = {
  totalDistance: 142.5,
  totalHours: 38,
  logCount: 9,
  tripCount: 4,
  endorsementsReceived: 3,
  conditionsDistribution: { "2": 4, "3": 3, "5": 2 },
  activityByMonth: [
    { month: "2026-05", distance: 60, hours: 12, count: 3 },
    { month: "2026-06", distance: 82.5, hours: 26, count: 6 },
  ],
}

const PUBLIC_USER_FIXTURE = {
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: "https://cdn.example.com/avatars/abc.png",
  bio: "Tidal-race junkie based in Pembrokeshire.",
  homeLocation: "Pembrokeshire, Wales",
  certifications: [
    {
      organization: "British Canoeing",
      award: "Sea Kayak Leader",
      awardedAt: "2024-05-01",
      validUntil: "2027-05-01",
    },
  ],
  stats: STATS_FIXTURE,
}

describe("StatsSchema", () => {
  it("parses a full stats fixture", () => {
    expect(StatsSchema.safeParse(STATS_FIXTURE).success).toBe(true)
  })

  it("accepts an empty conditions distribution and activity", () => {
    const result = StatsSchema.safeParse({
      ...STATS_FIXTURE,
      conditionsDistribution: {},
      activityByMonth: [],
    })
    expect(result.success).toBe(true)
  })

  it("rejects a missing aggregate field", () => {
    const { totalDistance: _, ...rest } = STATS_FIXTURE
    expect(StatsSchema.safeParse(rest).success).toBe(false)
  })
})

describe("PublicUserSchema", () => {
  it("parses a full public user fixture", () => {
    expect(PublicUserSchema.safeParse(PUBLIC_USER_FIXTURE).success).toBe(true)
  })

  it("accepts null bio, homeLocation and surname", () => {
    const result = PublicUserSchema.safeParse({
      ...PUBLIC_USER_FIXTURE,
      surname: null,
      bio: null,
      homeLocation: null,
    })
    expect(result.success).toBe(true)
  })

  it("strips private fields — unknown keys are not retained", () => {
    const result = PublicUserSchema.safeParse({
      ...PUBLIC_USER_FIXTURE,
      mail: "leak@x.com",
      phone: "123",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect("mail" in result.data).toBe(false)
      expect("phone" in result.data).toBe(false)
    }
  })
})
