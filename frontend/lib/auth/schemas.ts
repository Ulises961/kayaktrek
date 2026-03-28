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
  name: z.string().min(1, "Name is required."),
  phone: z.string().min(1, "Phone is required."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be at most 128 characters.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character."),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
