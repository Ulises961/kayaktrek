"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PackageIcon } from "lucide-react"
import type { Inventory } from "@/lib/dtos/inventory"
import type { Item } from "@/lib/dtos/item"
import { createInventory } from "@/lib/inventory/actions"
import { RequirementsChecklist } from "@/components/inventory/requirements-checklist"
import { Button } from "@/components/ui/button"

interface ItemsTabProps {
  tripId: string
  inventory?: Inventory | null
  isLeader: boolean
  isMember?: boolean
  myItems?: Item[]
}

export function ItemsTab({
  tripId,
  inventory,
  isLeader,
  isMember = false,
  myItems = [],
}: ItemsTabProps) {
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

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PackageIcon className="text-muted-foreground size-4" />
        Trip inventory
      </p>

      <RequirementsChecklist
        inventoryId={inventory.id!}
        tripId={tripId}
        requirements={inventory.requirements ?? []}
        myItems={myItems}
        canManage={isMember}
      />
    </div>
  )
}
