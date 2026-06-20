"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PackageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Inventory } from "@/lib/dtos/inventory"
import { createInventory } from "@/lib/inventory/actions"
import { Button } from "@/components/ui/button"

interface ItemsTabProps {
  tripId: string
  inventory?: Inventory | null
  isLeader: boolean
}

export function ItemsTab({ tripId, inventory, isLeader }: ItemsTabProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const result = await createInventory(tripId)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  if (!inventory) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PackageIcon className="text-muted-foreground size-4" />
          Items
        </p>
        {isLeader ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-muted-foreground text-sm">
              No inventory yet. Create one to track the gear this trip needs and let the crew
              contribute their own.
            </p>
            <Button size="sm" disabled={isPending} onClick={handleCreate}>
              {isPending ? "Creating…" : "Create trip inventory"}
            </Button>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            The trip leader hasn&rsquo;t set up an inventory yet.
          </p>
        )}
      </div>
    )
  }

  const requirements = inventory.requirements ?? []

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PackageIcon className="text-muted-foreground size-4" />
        Trip inventory
      </p>

      {requirements.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">No requirements yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requirements.map((req) => (
            <li
              key={req.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="font-medium">{req.name}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
                  req.status === "covered"
                    ? "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]"
                    : "bg-[var(--state-planning-bg)] text-[var(--state-planning-fg)]",
                )}
              >
                {req.status ?? "needed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
