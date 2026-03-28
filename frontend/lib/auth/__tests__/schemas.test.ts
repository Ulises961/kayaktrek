import { describe, it, expect } from "vitest"
import { LoginSchema, RegisterSchema } from "../schemas"

// A password that satisfies all RegisterSchema rules
const STRONG_PASSWORD = "Expedition#24"

describe("LoginSchema", () => {
  it("accepts any non-empty password (complexity is not enforced at login)", () => {
    expect(LoginSchema.safeParse({ mail: "user@example.com", password: "anything" }).success).toBe(true)
  })

  it("rejects an invalid email", () => {
    const result = LoginSchema.safeParse({ mail: "not-an-email", password: "anything" })
    expect(result.success).toBe(false)
  })

  it("rejects an empty password", () => {
    const result = LoginSchema.safeParse({ mail: "user@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})

describe("RegisterSchema", () => {
  const valid = {
    mail: "user@example.com",
    username: "kayaker_42",
    name: "Ulises",
    phone: "+34600000000",
    password: STRONG_PASSWORD,
  }

  it("accepts a fully valid payload", () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true)
  })

  describe("mail", () => {
    it("rejects an invalid email", () => {
      const result = RegisterSchema.safeParse({ ...valid, mail: "bad-email" })
      expect(result.success).toBe(false)
    })
  })

  describe("username", () => {
    it("rejects usernames shorter than 3 characters", () => {
      const result = RegisterSchema.safeParse({ ...valid, username: "ab" })
      expect(result.success).toBe(false)
    })

    it("rejects usernames longer than 32 characters", () => {
      const result = RegisterSchema.safeParse({ ...valid, username: "a".repeat(33) })
      expect(result.success).toBe(false)
    })

    it("rejects usernames with spaces", () => {
      const result = RegisterSchema.safeParse({ ...valid, username: "bad username" })
      expect(result.success).toBe(false)
    })

    it("rejects usernames with special characters", () => {
      const result = RegisterSchema.safeParse({ ...valid, username: "user@name" })
      expect(result.success).toBe(false)
    })

    it("accepts usernames with letters, numbers, and underscores", () => {
      expect(RegisterSchema.safeParse({ ...valid, username: "kayaker_42" }).success).toBe(true)
    })
  })

  describe("name", () => {
    it("rejects an empty name", () => {
      const result = RegisterSchema.safeParse({ ...valid, name: "" })
      expect(result.success).toBe(false)
    })
  })

  describe("phone", () => {
    it("rejects an empty phone", () => {
      const result = RegisterSchema.safeParse({ ...valid, phone: "" })
      expect(result.success).toBe(false)
    })
  })

  describe("password", () => {
    it("rejects passwords shorter than 12 characters", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Short#1aB" })
      expect(result.success).toBe(false)
    })

    it("rejects passwords longer than 128 characters", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Aa1!" + "x".repeat(125) })
      expect(result.success).toBe(false)
    })

    it("rejects passwords without an uppercase letter", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "expedition#24" })
      expect(result.success).toBe(false)
    })

    it("rejects passwords without a lowercase letter", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "EXPEDITION#24" })
      expect(result.success).toBe(false)
    })

    it("rejects passwords without a number", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Expedition#xx" })
      expect(result.success).toBe(false)
    })

    it("rejects passwords without a special character", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Expedition424" })
      expect(result.success).toBe(false)
    })

    it("accepts a password satisfying all rules", () => {
      expect(RegisterSchema.safeParse({ ...valid, password: STRONG_PASSWORD }).success).toBe(true)
    })
  })
})
