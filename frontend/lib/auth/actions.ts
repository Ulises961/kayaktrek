"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { API_URL } from "@/lib/api/config"
import { z } from "zod"
import { LoginSchema, RegisterSchema } from "@/lib/auth/schemas"

export type AuthResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: ReturnType<typeof z.treeifyError> }

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

export async function login(_prevState: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const parsed = LoginSchema.safeParse({
    mail: formData.get("mail"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { success: false, error: "Please fix the errors below.", fieldErrors: z.treeifyError(parsed.error) }
  }

  const { mail, password } = parsed.data

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail, password }),
    })
  } catch {
    return { success: false, error: "Could not reach the server. Please try again." }
  }

  if (res.status === 401 || res.status === 403) {
    return { success: false, error: "Invalid email or password." }
  }
  if (!res.ok) {
    return { success: false, error: "Something went wrong. Please try again." }
  }

  const { access_token, refresh_token } = await res.json()
  await setAuthCookies(access_token, refresh_token)
  redirect("/dashboard")
}

export async function register(_prevState: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const parsed = RegisterSchema.safeParse({
    mail: formData.get("mail"),
    username: formData.get("username"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { success: false, error: "Please fix the errors below.", fieldErrors: z.treeifyError(parsed.error) }
  }

  const { mail, username, name, phone, password } = parsed.data
  const body = { mail, username, name, phone, pwd: password }

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/auth/register`, {
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

  const { access_token, refresh_token } = await res.json()
  await setAuthCookies(access_token, refresh_token)
  redirect("/dashboard")
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
    res = await fetch(`${API_URL}/api/auth/refresh`, {
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
