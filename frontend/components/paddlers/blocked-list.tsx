"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { unblockPaddler } from "@/lib/blocks/actions"
import type { Block } from "@/lib/dtos/block"

interface BlockedListProps {
  blocks: Block[]
}

// The block-management screen: each blocked paddler with an Unblock action.
// Unblocking does not restore any prior connection.
export function BlockedList({ blocks }: BlockedListProps) {
  if (blocks.length === 0) {
    return <p className="text-muted-foreground text-sm">You haven&apos;t blocked anyone.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block) => (
        <BlockRow key={block.id} block={block} />
      ))}
    </div>
  )
}

function BlockRow({ block }: { block: Block }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const user = block.blocked
  const fullName = [user.name, user.surname].filter(Boolean).join(" ")

  function unblock() {
    setError(null)
    startTransition(async () => {
      const result = await unblockPaddler(block.id!)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <UserAvatar name={user.name} surname={user.surname} imageUrl={user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{fullName}</p>
        <p className="text-muted-foreground truncate text-xs">@{user.username}</p>
        {error && <p className="text-destructive mt-0.5 text-xs">{error}</p>}
      </div>
      <Button size="sm" variant="outline" disabled={pending} onClick={unblock}>
        Unblock
      </Button>
    </div>
  )
}
