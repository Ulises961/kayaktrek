"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { UsersIcon, SearchIcon } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { listConnections } from "@/lib/connections/actions"
import { inviteBuddy } from "@/lib/trips/actions"
import type { ConnectionUser } from "@/lib/dtos/connection"

interface InviteBuddyPickerProps {
  tripId: string
  // User ids already on the trip or pending — excluded from the picker.
  excludeUserIds: string[]
  currentUserId: string
}

// Lets a leader invite crew directly from their accepted buddies, instead of
// retyping an email. Buddies already on the trip (member or pending) are hidden.
export function InviteBuddyPicker({
  tripId,
  excludeUserIds,
  currentUserId,
}: InviteBuddyPickerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [buddies, setBuddies] = useState<ConnectionUser[]>([])
  const [loaded, setLoaded] = useState(false)
  const [term, setTerm] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    listConnections("accepted").then((connections) => {
      const others = connections.map((c) =>
        c.requester.id === currentUserId ? c.addressee : c.requester,
      )
      setBuddies(others)
      setLoaded(true)
    })
  }, [open, loaded, currentUserId])

  const excluded = new Set(excludeUserIds)
  const available = buddies.filter((b) => b.id && !excluded.has(b.id))
  const trimmedTerm = term.trim()
  const filtered = trimmedTerm
    ? available.filter((b) =>
        [b.name, b.surname, b.username]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(trimmedTerm.toLowerCase()),
      )
    : available

  function invite(userId: string) {
    setError(null)
    startTransition(async () => {
      const result = await inviteBuddy(tripId, userId)
      if (!result.success) setError(result.error)
      else {
        setBuddies((prev) => prev.filter((b) => b.id !== userId))
        router.refresh()
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <UsersIcon className="size-4" /> Invite a buddy
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        {!loaded ? (
          <p className="text-muted-foreground p-2 text-sm">Loading buddies…</p>
        ) : available.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">No buddies available to invite.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search your buddies…"
                className="h-8 pl-7 text-sm"
              />
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col gap-1.5 p-2 text-sm">
                <p className="text-muted-foreground">
                  No buddies match &ldquo;{trimmedTerm}&rdquo;.
                </p>
                <Link
                  href={`/paddlers?q=${encodeURIComponent(trimmedTerm)}`}
                  className="text-primary hover:underline"
                >
                  Can&apos;t find them? Find paddlers →
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col">
                {filtered.map((buddy) => (
                  <li key={buddy.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => invite(buddy.id!)}
                      className="hover:bg-secondary flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                    >
                      <UserAvatar
                        name={buddy.name}
                        surname={buddy.surname}
                        imageUrl={buddy.avatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {[buddy.name, buddy.surname].filter(Boolean).join(" ")}
                        <span className="text-muted-foreground"> @{buddy.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <p className="text-destructive px-2 pt-1 text-xs">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
