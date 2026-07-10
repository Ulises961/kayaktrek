import { describe, it, expect } from "vitest"
import { UserSchema, TravellerSchema, ProfileFormSchema, ChangePasswordSchema } from "../user"
import { DISTANCE_UNIT } from "../../itinerary/distance"

const BASE_USER = {
  id: "01952f1a-0000-7000-8000-000000000001",
  mail: "ada@example.com",
  username: "ada",
  name: "Ada",
  surname: "Lovelace",
  phone: "+34600000001",
  admin: false,
}

describe("UserSchema", () => {
  it("parses a minimal user", () => {
    const result = UserSchema.safeParse(BASE_USER)
    expect(result.success).toBe(true)
  })

  it("accepts all float plan fields", () => {
    const result = UserSchema.safeParse({
      ...BASE_USER,
      vesselMake: "Wilderness Systems",
      vesselModel: "Tempest 170",
      vesselLengthCm: 518,
      vesselColorPrimary: "Red",
      vesselColorSecondary: "White",
      emergencyContactName: "Grace Hopper",
      emergencyContactPhone: "+34600000002",
      emergencyContactRelationship: "Partner",
      medicalNotesConsentAt: "2026-05-01T10:00:00Z",
      deletionRequestedAt: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid avatarUrl", () => {
    const result = UserSchema.safeParse({
      ...BASE_USER,
      avatarUrl: "http://localhost:9000/kplanner/avatars/01952f1a.jpg",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-URL avatarUrl", () => {
    const result = UserSchema.safeParse({ ...BASE_USER, avatarUrl: "/static/avatars/foo.jpg" })
    expect(result.success).toBe(false)
  })

  it("allows null and absent optional fields", () => {
    const result = UserSchema.safeParse({ ...BASE_USER, surname: null, avatarUrl: null })
    expect(result.success).toBe(true)
  })

  it("defaults unitPreference to nm when absent", () => {
    const result = UserSchema.parse(BASE_USER)
    expect(result.unitPreference).toBe(DISTANCE_UNIT.NM)
  })

  it("accepts an explicit unitPreference", () => {
    const result = UserSchema.safeParse({ ...BASE_USER, unitPreference: DISTANCE_UNIT.KM })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid unitPreference", () => {
    const result = UserSchema.safeParse({ ...BASE_USER, unitPreference: "miles" })
    expect(result.success).toBe(false)
  })
})

describe("TravellerSchema", () => {
  it("parses a minimal traveller", () => {
    const result = TravellerSchema.safeParse(BASE_USER)
    expect(result.success).toBe(true)
  })

  it("accepts a valid avatarUrl", () => {
    const result = TravellerSchema.safeParse({
      ...BASE_USER,
      avatarUrl: "http://localhost:9000/kplanner/avatars/01952f1a.jpg",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-URL avatarUrl", () => {
    const result = TravellerSchema.safeParse({ ...BASE_USER, avatarUrl: "not-a-url" })
    expect(result.success).toBe(false)
  })
})

describe("ProfileFormSchema", () => {
  const VALID = {
    name: "Ada",
    surname: "Lovelace",
    phone: "+34600000001",
    username: "ada_lovelace",
    unitPreference: DISTANCE_UNIT.NM,
  }

  it("accepts a valid minimal profile", () => {
    expect(ProfileFormSchema.safeParse(VALID).success).toBe(true)
  })

  it("rejects an invalid unitPreference", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, unitPreference: "miles" }).success).toBe(false)
  })

  it("rejects an empty name", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, name: "" }).success).toBe(false)
  })

  it("rejects a username with spaces", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, username: "ada lovelace" }).success).toBe(false)
  })

  it("rejects a username shorter than 3 characters", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, username: "ab" }).success).toBe(false)
  })

  it("accepts vessel and emergency contact fields", () => {
    const result = ProfileFormSchema.safeParse({
      ...VALID,
      vesselMake: "Wilderness Systems",
      vesselLengthCm: "518",
      emergencyContactName: "Grace Hopper",
      emergencyContactPhone: "+34600000002",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-integer vesselLengthCm", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, vesselLengthCm: "abc" }).success).toBe(false)
  })

  it("rejects HTML tags in free-text fields", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, name: "<script>x</script>" }).success).toBe(
      false,
    )
    expect(ProfileFormSchema.safeParse({ ...VALID, vesselMake: "<b>Prijon</b>" }).success).toBe(
      false,
    )
    expect(
      ProfileFormSchema.safeParse({ ...VALID, emergencyContactName: "<img src=x>" }).success,
    ).toBe(false)
  })

  it("accepts an empty vesselLengthCm (optional field)", () => {
    expect(ProfileFormSchema.safeParse({ ...VALID, vesselLengthCm: "" }).success).toBe(true)
  })
})

describe("ChangePasswordSchema", () => {
  const VALID = {
    currentPwd: "anypassword",
    newPwd: "NewPass1!",
    confirmPwd: "NewPass1!",
  }

  it("accepts a valid payload", () => {
    expect(ChangePasswordSchema.safeParse(VALID).success).toBe(true)
  })

  it("rejects when passwords do not match", () => {
    expect(ChangePasswordSchema.safeParse({ ...VALID, confirmPwd: "Different1!" }).success).toBe(
      false,
    )
  })

  it("rejects a new password without a special character", () => {
    expect(
      ChangePasswordSchema.safeParse({ ...VALID, newPwd: "NewPass1", confirmPwd: "NewPass1" })
        .success,
    ).toBe(false)
  })

  it("rejects a new password without a number", () => {
    expect(
      ChangePasswordSchema.safeParse({ ...VALID, newPwd: "NewPass!", confirmPwd: "NewPass!" })
        .success,
    ).toBe(false)
  })

  it("rejects a new password shorter than 8 characters", () => {
    expect(
      ChangePasswordSchema.safeParse({ ...VALID, newPwd: "Sh0rt!", confirmPwd: "Sh0rt!" }).success,
    ).toBe(false)
  })

  it("rejects an empty current password", () => {
    expect(ChangePasswordSchema.safeParse({ ...VALID, currentPwd: "" }).success).toBe(false)
  })
})
