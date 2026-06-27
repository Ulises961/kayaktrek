"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { API_URL, API_PREFIX } from "@/lib/api/config"
import { z } from "zod"
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/auth/schemas"

export type AuthResult =
  | { success: true }
  | {
      success: false
      error: string
      code?: string
      fieldErrors?: ReturnType<typeof z.treeifyError>
    }

async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()
  cookieStore.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15, // 15 minutes
  })
  cookieStore.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function login(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse({
    mail: formData.get("mail"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: z.treeifyError(parsed.error),
    }
  }

  const { mail, password } = parsed.data

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail, pwd: password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    if (body?.code === "deletion_pending") {
      return {
        success: false,
        error: "This account is scheduled for deletion.",
        code: "deletion_pending",
      }
    }
    return { success: false, error: "Access denied." }
  }
  if (res.status === 401) {
    return { success: false, error: "Invalid email or password." }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  const { access_token, refresh_token } = await res.json()
  await setAuthCookies(access_token, refresh_token)
  redirect("/dashboard")
}

export async function register(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = RegisterSchema.safeParse({
    mail: formData.get("mail"),
    username: formData.get("username"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: z.treeifyError(parsed.error),
    }
  }

  const { mail, username, name, phone, password } = parsed.data
  const body = { mail, username, name, phone, pwd: password }

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 409) {
    return { success: false, error: "Email or username already in use." }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  redirect("/login?registered=1")
}

export async function forgotPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = ForgotPasswordSchema.safeParse({ mail: formData.get("mail") })
  if (!parsed.success) {
    return { success: false, error: "Enter a valid email address." }
  }

  try {
    await fetch(`${API_URL}${API_PREFIX}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail: parsed.data.mail }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  return { success: true }
}

export async function resetPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors below.",
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: parsed.data.token, pwd: parsed.data.password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (!res.ok) {
    return { success: false, error: "Invalid or expired reset link." }
  }

  redirect("/login?reset=1")
}

export async function cancelDeletion(token: string): Promise<AuthResult> {
  let res: Response
  try {
    res = await fetch(
      `${API_URL}${API_PREFIX}/user/me/deletion-request?token=${encodeURIComponent(token)}`,
      {
        method: "DELETE",
      },
    )
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return {
      success: false,
      error: body?.description ?? "The cancellation link is invalid or has expired.",
    }
  }

  return { success: true }
}

export async function resendDeletionCancel(mail: string): Promise<AuthResult> {
  try {
    await fetch(`${API_URL}${API_PREFIX}/auth/resend-deletion-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  return { success: true }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete("access_token")
  cookieStore.delete("refresh_token")
  redirect("/")
}

export async function refreshSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get("refresh_token")?.value
  if (!refreshToken) return false

  let res: Response
  try {
    res = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshToken}`,
      },
    })
  } catch {
    return false
  }

  if (!res.ok) return false

  const { access_token, refresh_token } = await res.json()
  await setAuthCookies(access_token, refresh_token)
  return true
}
