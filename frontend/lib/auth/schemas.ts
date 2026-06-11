import { z } from "zod"
import { noHtmlTags } from "@/lib/validators"

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
  name: z
    .string()
    .min(1, "Name is required.")
    .max(100, "Name must be at most 100 characters.")
    .refine(noHtmlTags.check, noHtmlTags.message),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format: +34600000000"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be at most 128 characters.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character."),
})

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
      .regex(/[^a-zA-Z0-9]/, "At least one special character."),
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
