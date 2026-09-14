import { describe, it, expect } from "vitest"
import {
  LoginSchema,
  RegisterSchema,
  PASSWORD_RULES,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../schemas"

// A password that satisfies all RegisterSchema rules
const STRONG_PASSWORD = "Expedition#24"

describe("LoginSchema", () => {
  it("accepts any non-empty password (complexity is not enforced at login)", () => {
    expect(LoginSchema.safeParse({ mail: "user@example.com", password: "anything" }).success).toBe(
      true,
    )
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

  describe("phone", () => {
    it("is optional — signup no longer collects it (M12 §F)", () => {
      const { phone: _phone, ...withoutPhone } = valid
      expect(RegisterSchema.safeParse(withoutPhone).success).toBe(true)
    })

    it("still accepts a phone when one is provided", () => {
      expect(RegisterSchema.safeParse({ ...valid, phone: "+34600000000" }).success).toBe(true)
    })
  })

  describe("PASSWORD_RULES", () => {
    it("mirrors the schema: a password passing every rule passes the schema", () => {
      expect(PASSWORD_RULES.every((r) => r.test(STRONG_PASSWORD))).toBe(true)
      expect(RegisterSchema.safeParse({ ...valid, password: STRONG_PASSWORD }).success).toBe(true)
    })

    it.each([
      ["short", "Sh#1aB"],
      ["no lowercase", "EXPEDITION#24"],
      ["no uppercase", "expedition#24"],
      ["no number", "Expedition#xx"],
      ["no special character", "Expedition424"],
    ])("mirrors the schema: %s fails at least one rule and fails the schema", (_label, pwd) => {
      expect(PASSWORD_RULES.every((r) => r.test(pwd))).toBe(false)
      expect(RegisterSchema.safeParse({ ...valid, password: pwd }).success).toBe(false)
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

    // A space or a non-ASCII character is "special" under a naive [^a-zA-Z0-9] class but is not
    // in the backend's fixed punctuation set (backend/Schemas/user_schema.py validate_pwd) — a
    // password that only satisfies the special-character rule via one of these passes here and
    // 422s at the server.
    it("rejects a password whose only 'special' character is a space", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Expedition 424" })
      expect(result.success).toBe(false)
    })

    it("rejects a password whose only 'special' character is non-ASCII", () => {
      const result = RegisterSchema.safeParse({ ...valid, password: "Expedition424é" })
      expect(result.success).toBe(false)
    })
  })
})

describe("ForgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(ForgotPasswordSchema.safeParse({ mail: "user@example.com" }).success).toBe(true)
  })

  it("rejects an invalid email", () => {
    const result = ForgotPasswordSchema.safeParse({ mail: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("rejects a missing email", () => {
    const result = ForgotPasswordSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe("ResetPasswordSchema", () => {
  const valid = {
    token: "reset-token-123",
    password: STRONG_PASSWORD,
    confirmPassword: STRONG_PASSWORD,
  }

  it("accepts a fully valid payload", () => {
    expect(ResetPasswordSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a missing token", () => {
    const result = ResetPasswordSchema.safeParse({ ...valid, token: "" })
    expect(result.success).toBe(false)
  })

  it("rejects a password that fails the complexity rules, same as RegisterSchema", () => {
    const result = ResetPasswordSchema.safeParse({
      ...valid,
      password: "weak",
      confirmPassword: "weak",
    })
    expect(result.success).toBe(false)
  })

  // The cross-field refine is the one piece of behaviour unique to this schema (RegisterSchema
  // has no confirm field) — the M14-style bug this rubric exists for is exactly this kind of
  // "covered but unasserted" branch, so pin down both that it fails AND where the error lands.
  describe("confirmPassword", () => {
    it("rejects when confirmPassword does not match password", () => {
      const result = ResetPasswordSchema.safeParse({
        ...valid,
        confirmPassword: STRONG_PASSWORD + "x",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["confirmPassword"])
        expect(result.error.issues[0].message).toBe("Passwords do not match.")
      }
    })

    it("accepts when confirmPassword matches password exactly", () => {
      expect(ResetPasswordSchema.safeParse(valid).success).toBe(true)
    })
  })
})
