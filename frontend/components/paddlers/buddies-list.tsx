"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, XIcon, UserMinusIcon } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { ListRow } from "@/components/common/list-row"
import { acceptConnection, removeConnection } from "@/lib/connections/actions"
import type { Connection, ConnectionUser } from "@/lib/dtos/connection"
import { formatPaddlerName } from "@/lib/user/format"
import { EmptyState } from "@/components/common/empty-state"
import { UserGroupIcon } from "@/components/icons/heroicons-user-group"

interface BuddiesListProps {
  connections: Connection[]
  currentUserId: string
  /** The active search term, if any — distinguishes "no buddies yet" from
   * "no buddies match this search" when the caller has already filtered
   * `connections` down to an empty array. */
  searchTerm?: string
}

// Splits the caller's connections into incoming requests (caller is addressee),
// outgoing requests (caller is requester) and accepted buddies. Each row offers the
// action appropriate to that bucket.
export function BuddiesList({ connections, currentUserId, searchTerm }: BuddiesListProps) {
  const buddies = connections.filter((c) => c.status === "accepted")
  const incoming = connections.filter(
    (c) => c.status === "pending" && c.addressee.id === currentUserId,
  )
  const outgoing = connections.filter(
    (c) => c.status === "pending" && c.requester.id === currentUserId,
  )

  if (connections.length === 0) {
    return (
      // A search miss is transient and the buddies do exist — that stays a
      // plain line. Having none at all is the empty state.
      searchTerm ? (
        <EmptyState variant="inline" title={`No buddies match "${searchTerm}".`} />
      ) : (
        <EmptyState
          icon={UserGroupIcon}
          title="No buddies yet"
          description="Paddlers you connect with appear here, so you can invite them to a trip without searching each time."
        />
      )
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {incoming.length > 0 && (
        <Section title={`Buddy requests (${incoming.length})`}>
          <ul className="flex flex-col">
            {incoming.map((c) => (
              <ConnectionRow
                key={c.id}
                connectionId={c.id!}
                user={c.requester}
                variant="incoming"
              />
            ))}
          </ul>
        </Section>
      )}
      {outgoing.length > 0 && (
        <Section title={`Sent requests (${outgoing.length})`}>
          <ul className="flex flex-col">
            {outgoing.map((c) => (
              <ConnectionRow
                key={c.id}
                connectionId={c.id!}
                user={c.addressee}
                variant="outgoing"
              />
            ))}
          </ul>
        </Section>
      )}
      <Section title={`Buddies (${buddies.length})`}>
        {buddies.length === 0 ? (
          <EmptyState variant="inline" title="No buddies yet." />
        ) : (
          <ul className="flex flex-col">
            {buddies.map((c) => {
              const other = c.requester.id === currentUserId ? c.addressee : c.requester
              return <ConnectionRow key={c.id} connectionId={c.id!} user={other} variant="buddy" />
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h2>
      {children}
    </div>
  )
}

function ConnectionRow({
  connectionId,
  user,
  variant,
}: {
  connectionId: string
  user: ConnectionUser
  variant: "incoming" | "outgoing" | "buddy"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const fullName = formatPaddlerName(user)

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error ?? "Something went wrong.")
      else router.refresh()
    })
  }

  return (
    <ListRow className="flex items-center gap-3 py-2.5">
      <Link href={`/paddlers/${user.username}`} className="shrink-0">
        <UserAvatar name={user.name} surname={user.surname} imageUrl={user.avatarUrl} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/paddlers/${user.username}`} className="truncate font-medium hover:underline">
          {fullName}
        </Link>
        <p className="text-muted-foreground truncate text-xs">@{user.username}</p>
        {error && <p className="text-destructive mt-0.5 text-xs">{error}</p>}
      </div>

      {/* Every row-end action here drops its wording on a phone and keeps its icon,
          the same way the search results do — the row already carries a name and a
          handle, and these labels are what push it against the viewport. `sr-only`
          rather than `hidden`, so the button keeps its accessible name at 320. */}
      {variant === "incoming" && (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptConnection(connectionId))}
          >
            <CheckIcon className="size-4" />
            <span className="sr-only sm:not-sr-only">Accept</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => removeConnection(connectionId))}
          >
            <XIcon className="size-4" />
            <span className="sr-only sm:not-sr-only">Decline</span>
          </Button>
        </div>
      )}
      {variant === "outgoing" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => removeConnection(connectionId))}
        >
          <XIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Cancel</span>
        </Button>
      )}
      {variant === "buddy" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => removeConnection(connectionId))}
        >
          <UserMinusIcon className="size-4" />
          <span className="sr-only sm:not-sr-only">Unfriend</span>
        </Button>
      )}
    </ListRow>
  )
}
