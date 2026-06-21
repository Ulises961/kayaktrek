"use client"

import { BackpackIcon, PackageIcon } from "lucide-react"
import type { Inventory } from "@/lib/dtos/inventory"
import type { Item } from "@/lib/dtos/item"
import type { PersonalPackingItem } from "@/lib/dtos/personal-packing"
import { RequirementsChecklist } from "@/components/inventory/requirements-checklist"
import { PersonalPacking } from "@/components/inventory/personal-packing"

interface ItemsTabProps {
  tripId: string
  inventory?: Inventory | null
  isLeader: boolean
  isMember?: boolean
  myItems?: Item[]
  packingItems?: PersonalPackingItem[]
  currentUserId?: string
}

export function ItemsTab({
  tripId,
  inventory,
  isMember = false,
  myItems = [],
  packingItems = [],
  currentUserId,
}: ItemsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PackageIcon className="text-muted-foreground size-4" />
          Trip inventory
        </p>

        {inventory ? (
          <RequirementsChecklist
            inventoryId={inventory.id!}
            tripId={tripId}
            requirements={inventory.requirements ?? []}
            myItems={myItems}
            canManage={isMember}
            currentUserId={currentUserId}
          />
        ) : (
          <p className="text-muted-foreground text-sm italic">
            This trip&rsquo;s inventory isn&rsquo;t available yet.
          </p>
        )}
      </section>

      {isMember && (
        <section className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BackpackIcon className="text-muted-foreground size-4" />
            My kit
            <span className="text-muted-foreground text-xs font-normal">· private to you</span>
          </p>
          <PersonalPacking tripId={tripId} packingItems={packingItems} myItems={myItems} />
        </section>
      )}
    </div>
  )
}
