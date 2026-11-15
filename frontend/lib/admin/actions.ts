"use server"

import { ApiError, apiPost, isRedirectError } from "@/lib/api/client"
import { CorrectUnverifiedMailResponseSchema, CorrectUnverifiedMailSchema } from "./schemas"

export type CorrectUnverifiedMailResult =
  { success: true; username: string; mail: string } | { success: false; error: string }

// The backend refuses with a message written for an administrator (no such username, already
// verified, address held by someone else, malformed address), so those pass through as
// written. Anything else is not the admin's mistake and gets a generic line.
const ADMIN_READABLE_STATUSES = [400, 404, 409]
const NOT_AN_ADMIN = "Only administrators can do this."
const GENERIC_FAILURE = "Something went wrong. Please try again."

/**
 * Move an unverified account to the address its owner meant to type and mail a fresh
 * verification link there. The backend decides who may call it; this only carries the request.
 */
export async function correctUnverifiedMail(
  _prevState: CorrectUnverifiedMailResult | null,
  formData: FormData,
): Promise<CorrectUnverifiedMailResult> {
  const parsed = CorrectUnverifiedMailSchema.safeParse({
    username: formData.get("username"),
    newMail: formData.get("newMail"),
  })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors below.",
    }
  }

  try {
    const raw = await apiPost<unknown>("/api/user/correct-unverified-mail", parsed.data)
    const moved = CorrectUnverifiedMailResponseSchema.parse(raw)
    return { success: true, username: moved.username, mail: moved.mail }
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof ApiError) {
      if (error.status === 403) return { success: false, error: NOT_AN_ADMIN }
      if (ADMIN_READABLE_STATUSES.includes(error.status)) {
        return { success: false, error: error.message }
      }
    }
    return { success: false, error: GENERIC_FAILURE }
  }
}
