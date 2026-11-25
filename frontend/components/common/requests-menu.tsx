"use client"

import { useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BellIcon } from "lucide-react"
import { usePendingRequests } from "@/hooks/use-pending-requests"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { NotificationKind } from "@/lib/dtos/pending-requests"
import { markNotificationsRead } from "@/lib/requests/mutations"
import {
  badgeTotal,
  buildNotificationRows,
  buildPendingRequestRows,
  listsPendingRequests,
  type PendingRequestsSummary,
} from "@/lib/requests/pending"

interface RequestsMenuProps {
  pendingRequests: PendingRequestsSummary
}

// Header-level notification entry, between the breadcrumb and the account menu.
// Collapses the three independent "someone is waiting on you" surfaces (trip
// invitations, incoming buddy requests, incoming endorsement asks) into one
// entry that routes each item to where it's actually handled (/invitations,
// /paddlers, /logs), rather than giving only trip invitations a dedicated
// sidebar slot. It also carries the answers to what the user sent: when someone accepts their
// trip invitation or buddy request, a row says so until they open it. The counts are kept
// current by polling (usePendingRequests), and when they change on a page that lists the
// requests themselves, that page is refreshed too.
export function RequestsMenu({ pendingRequests }: RequestsMenuProps) {
  const router = useRouter()
  const pathname = usePathname()
  const refreshListing = useCallback(() => {
    if (listsPendingRequests(pathname)) router.refresh()
  }, [pathname, router])
  const summary = usePendingRequests(pendingRequests, refreshListing)

  const rows = [...buildPendingRequestRows(summary), ...buildNotificationRows(summary)]
  const total = badgeTotal(summary)

  // Opening a row that reports an answer clears it, and the refresh brings the badge down.
  async function clearNotification(kind: NotificationKind) {
    await markNotificationsRead(kind)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Pending requests">
          <BellIcon className="h-4 w-4" />
          {total > 0 && (
            <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums">
              {total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {rows.length === 0 ? (
          <DropdownMenuItem disabled>No pending requests</DropdownMenuItem>
        ) : (
          rows.map((row) => (
            <DropdownMenuItem key={row.label} asChild>
              <Link
                href={row.href}
                onClick={row.clears ? () => void clearNotification(row.clears!) : undefined}
              >
                {row.label}
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
