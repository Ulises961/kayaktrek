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
import type { Relationship } from "@/lib/dtos/connection"

interface PaddlerResultCardProps {
  paddler: PaddlerSearchResult
}

// One search result: identity, the relationship-aware primary action, and a "…"
// menu carrying Block. The relationship is tracked locally so the action flips
// immediately (the finder's results are client state a server refresh won't
// re-fetch); we also refresh so the server-rendered Buddies/Blocked tabs stay in
// sync. A successful block hides the card outright — you no longer see them.
export function PaddlerResultCard({ paddler }: PaddlerResultCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [relationship, setRelationship] = useState<Relationship>(paddler.relationship)
  const [hidden, setHidden] = useState(false)

  const fullName = [paddler.name, paddler.surname].filter(Boolean).join(" ")

  function run(
    action: () => Promise<ConnectionActionResult | { success: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError("error" in result ? (result.error ?? null) : null)
      else {
        onSuccess?.()
        router.refresh()
      }
    })
  }

  if (hidden) return null

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

      {relationship === "none" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => requestConnection({ username: paddler.username }),
              () => setRelationship("pending_outgoing"),
            )
          }
        >
          <UserPlusIcon className="size-4" /> Add buddy
        </Button>
      )}
      {relationship === "pending_outgoing" && (
        <Button size="sm" variant="ghost" disabled>
          <ClockIcon className="size-4" /> Pending
        </Button>
      )}
      {relationship === "pending_incoming" && paddler.connectionId && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => acceptConnection(paddler.connectionId!),
              () => setRelationship("buddy"),
            )
          }
        >
          <CheckIcon className="size-4" /> Accept
        </Button>
      )}
      {relationship === "buddy" && (
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
            onClick={() =>
              run(
                () => blockPaddler({ username: paddler.username }),
                () => setHidden(true),
              )
            }
          >
            <BanIcon className="size-4" /> Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
