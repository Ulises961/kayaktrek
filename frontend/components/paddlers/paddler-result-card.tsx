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
import { ListRow } from "@/components/common/list-row"
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
import { formatPaddlerName } from "@/lib/user/format"

interface PaddlerResultCardProps {
  paddler: PaddlerSearchResult
}

// One search result: identity, the relationship-aware primary action, and a "…"
// menu carrying Block. The relationship is tracked locally so the action flips
// immediately (the finder's results are client state a server refresh won't
// re-fetch); we also refresh so the server-rendered Buddies/Blocked tabs stay in
// sync, and the hub passes the relationship back down as the connections change.
// A successful block hides the card outright — you no longer see them.
export function PaddlerResultCard({ paddler }: PaddlerResultCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [relationship, setRelationship] = useState<Relationship>(paddler.relationship)
  // The parent re-derives the relationship as the connections change (a request accepted, or
  // withdrawn, elsewhere), and that is newer than the value this card started with. An action's
  // own flip still stands until the prop actually changes.
  const [seenRelationship, setSeenRelationship] = useState<Relationship>(paddler.relationship)
  if (paddler.relationship !== seenRelationship) {
    setSeenRelationship(paddler.relationship)
    setRelationship(paddler.relationship)
  }
  const [hidden, setHidden] = useState(false)

  const fullName = formatPaddlerName(paddler)

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
    <ListRow as="div" className="flex items-center gap-3 py-2.5">
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
          {/* Icon-only on a phone: this sits at the end of a search-result row that
              already carries a name and a handle, and the label was what pushed the row
              past the viewport. The accessible name stays on the button either way. */}
          <UserPlusIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Add buddy</span>
        </Button>
      )}
      {relationship === "pending_outgoing" && (
        <Button size="sm" variant="ghost" disabled>
          <ClockIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Pending</span>
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
          <CheckIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Accept</span>
        </Button>
      )}
      {relationship === "buddy" && (
        // A disabled status marker rather than an action — so on a phone the icon alone
        // carries it, and the word only earns its space once there is space.
        <Button size="sm" variant="ghost" disabled aria-label="Already buddies">
          <UsersIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Buddies</span>
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
    </ListRow>
  )
}
