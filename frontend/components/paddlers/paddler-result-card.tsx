"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  UserPlusIcon,
  ClockIcon,
  CheckIcon,
  UsersIcon,
  MoreHorizontalIcon,
  BanIcon,
} from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  requestConnection,
  acceptConnection,
  type ConnectionActionResult,
} from "@/lib/connections/actions"
import { blockPaddler } from "@/lib/blocks/actions"
import type { PaddlerSearchResult } from "@/lib/dtos/paddler-search"

interface PaddlerResultCardProps {
  paddler: PaddlerSearchResult
}

// One search result: identity, the relationship-aware primary action, and a "…"
// menu carrying Block. After any mutation we refresh so the annotation re-renders.
export function PaddlerResultCard({ paddler }: PaddlerResultCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const fullName = [paddler.name, paddler.surname].filter(Boolean).join(" ")

  function run(
    action: () => Promise<ConnectionActionResult | { success: boolean; error?: string }>,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError("error" in result ? (result.error ?? null) : null)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <Link href={`/paddlers/${paddler.username}`} className="shrink-0">
        <UserAvatar name={paddler.name} surname={paddler.surname} imageUrl={paddler.avatarUrl} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/paddlers/${paddler.username}`}
          className="truncate font-medium hover:underline"
        >
          {fullName}
        </Link>
        <p className="text-muted-foreground truncate text-xs">@{paddler.username}</p>
        {error && <p className="text-destructive mt-0.5 text-xs">{error}</p>}
      </div>

      {paddler.relationship === "none" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => requestConnection({ username: paddler.username }))}
        >
          <UserPlusIcon className="size-4" /> Add buddy
        </Button>
      )}
      {paddler.relationship === "pending_outgoing" && (
        <Button size="sm" variant="ghost" disabled>
          <ClockIcon className="size-4" /> Pending
        </Button>
      )}
      {paddler.relationship === "pending_incoming" && paddler.connectionId && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => acceptConnection(paddler.connectionId!))}
        >
          <CheckIcon className="size-4" /> Accept
        </Button>
      )}
      {paddler.relationship === "buddy" && (
        <Button size="sm" variant="ghost" disabled>
          <UsersIcon className="size-4" /> Buddies
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8 shrink-0">
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">More actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => blockPaddler({ username: paddler.username }))}
          >
            <BanIcon className="size-4" /> Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
