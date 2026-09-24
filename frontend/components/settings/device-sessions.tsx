"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LaptopIcon, MapPinIcon } from "lucide-react"
import { revokeSession } from "@/lib/sessions/actions"
import type { Session } from "@/lib/dtos/session"
import { formatDayDate, formatTimeAgo } from "@/lib/utils/date"
import { Button } from "@/components/ui/button"

type DeviceSessionsProps = {
  sessions: Session[]
  /** Set when the list could not be loaded, so the empty state doesn't claim there
   * are no devices when the truth is that we don't know. */
  loadError?: string
  /** Injectable clock so the elapsed-time labels are testable. */
  now?: Date
}

export function DeviceSessions({ sessions, loadError, now }: DeviceSessionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  function handleRevoke(sessionId: string) {
    setError(null)
    setRevokingId(sessionId)
    startTransition(async () => {
      const result = await revokeSession(sessionId)
      setRevokingId(null)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  if (loadError) {
    return <p className="text-muted-foreground text-sm">{loadError}</p>
  }

  // The caller is signed in, so their own session is always in this list — an empty
  // one means something upstream went wrong, not that nothing is signed in.
  if (sessions.length === 0) {
    return <p className="text-muted-foreground text-sm">No devices to show.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" data-testid="device-sessions">
        {sessions.map((session) => (
          <li
            key={session.id}
            data-testid="device-session-row"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <LaptopIcon className="text-muted-foreground size-4 shrink-0" />
                {session.deviceLabel ?? "Unknown device"}
                {session.isCurrent && (
                  <span className="text-muted-foreground text-xs font-normal">(this device)</span>
                )}
              </p>
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <MapPinIcon className="size-3.5 shrink-0" />
                {/* The lookup is city-level and approximate; the tilde says so rather
                    than presenting a guess as a fact. */}
                <span>
                  {session.locationLabel ? `~${session.locationLabel}` : "Unknown location"}
                </span>
                <span aria-hidden>·</span>
                <span>Active {formatTimeAgo(session.lastUsedAt, now)}</span>
                {/* Two sessions from the same browser in the same city are otherwise
                    identical rows, and "active" is the half that keeps moving. When a
                    session began is what distinguishes the laptop you signed in on last
                    week from one that appeared this morning — the question this list is
                    for. */}
                <span aria-hidden>·</span>
                <span>Signed in {formatDayDate(session.created)}</span>
              </p>
            </div>
            {!session.isCurrent && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleRevoke(session.id)}
              >
                {revokingId === session.id ? "Signing out…" : "Sign out"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
