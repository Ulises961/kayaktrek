import { z } from "zod"

export const LoginSchema = z.object({
  mail: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
})

export const RegisterSchema = z.object({
  mail: z.string().email("Enter a valid email address."),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be at most 32 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores."),
  // Optional since M12 §F — signup no longer asks for it; collected in Settings.
  phone: z.string().optional(),
  // The register form only renders this field while the invite-code kill switch is armed
  // (M25 §3 follow-up) — optional here so the schema itself never blocks submission on a
  // field that may not exist on the page; a wrong/missing code surfaces as a server error.
  inviteCode: z.string().optional(),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be at most 128 characters.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character."),
})

// The always-visible signup checklist mirrors RegisterSchema's password regexes
// verbatim (M12 §F) — change them together or the live checklist lies.
// Special-character set must match the backend's validate_pwd exactly
// (backend/Schemas/user_schema.py) — a broader class here (e.g. "anything non-alphanumeric")
// passes the frontend and 422s server-side.
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
  { label: "A special character", test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

export const ForgotPasswordSchema = z.object({
  mail: z.string().email("Enter a valid email address."),
})

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1, "Missing token."),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must be at most 128 characters.")
      .regex(/[a-z]/, "At least one lowercase letter.")
      .regex(/[A-Z]/, "At least one uppercase letter.")
      .regex(/[0-9]/, "At least one number.")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "At least one special character."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
