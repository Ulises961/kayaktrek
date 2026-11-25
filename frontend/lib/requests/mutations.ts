"use server"

import { apiPost, isRedirectError } from "@/lib/api/client"
import type { NotificationKind } from "@/lib/dtos/pending-requests"

export type MarkNotificationsReadResult = { success: true } | { success: false; error: string }

// Clears the user's unseen notifications of one kind, once they have opened the bell row that
// reported them. A failure leaves the notification showing; it is cleared the next time.
export async function markNotificationsRead(
  kind: NotificationKind,
): Promise<MarkNotificationsReadResult> {
  try {
    await apiPost("/api/pending-requests/notifications/read", { kind })
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to clear the notification.",
    }
  }
}
