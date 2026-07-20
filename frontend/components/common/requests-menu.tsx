"use client"

import Link from "next/link"
import { BellIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildPendingRequestRows, type PendingRequestsSummary } from "@/lib/requests/pending"

interface RequestsMenuProps {
  pendingRequests: PendingRequestsSummary
}

// Header-level notification entry, next to ThemeToggle — the natural home for
// account-scoped chrome (profile avatar is slated to join this same area).
// Collapses the three independent "someone is waiting on you" surfaces (trip
// invitations, incoming buddy requests, incoming endorsement asks) into one
// entry that routes each item to where it's actually handled (/invitations,
// /paddlers, /logs), rather than giving only trip invitations a dedicated
// sidebar slot.
export function RequestsMenu({ pendingRequests }: RequestsMenuProps) {
  const rows = buildPendingRequestRows(pendingRequests)
  const total =
    pendingRequests.tripInvitations +
    pendingRequests.buddyRequests +
    pendingRequests.endorsementRequests

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
            <DropdownMenuItem key={row.href} asChild>
              <Link href={row.href}>{row.label}</Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
