"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import type { Item } from "@/lib/dtos/item"
import type { PersonalPackingItem } from "@/lib/dtos/personal-packing"
import {
  addPackingItem,
  togglePackingItem,
  removePackingItem,
  type PackingActionResult,
} from "@/lib/inventory/personal-packing-actions"
import { bucketByCategory, packProgress } from "@/lib/inventory/format"
import { Button } from "@/components/ui/button"
import { ListRow } from "@/components/common/list-row"
import { SectionLabel } from "@/components/common/section-label"

interface PersonalPackingProps {
  tripId: string
  packingItems: PersonalPackingItem[]
  /** The current user's owned gear — the pool they can add to their kit. */
  myItems: Item[]
}

export function PersonalPacking({ tripId, packingItems, myItems }: PersonalPackingProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const packedItemIds = new Set(packingItems.map((p) => p.item?.id))
  const addable = myItems.filter((i) => i.status === "owned" && !packedItemIds.has(i.id))
  const progress = packProgress(packingItems)

  function run(fn: () => Promise<PackingActionResult>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {packingItems.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          Nothing in your kit yet — add your own gear below to track what you&rsquo;re carrying.
        </p>
      ) : (
        <>
          {/* Pack progress — the itinerary StatTile's mono-tabular convention. */}
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-mono text-sm font-medium tabular-nums">
              {progress.packed} of {progress.total}
            </span>{" "}
            packed
          </p>

          {/* Grouped by the clean FK-backed Item.category — no free-text
              bucketing problem on this side. Denser than requirements: single
              owner, no avatars. */}
          <div className="flex flex-col gap-4">
            {bucketByCategory(packingItems, (entry) => entry.item?.category?.name).map((bucket) => (
              <section key={bucket.key || "__uncategorised__"} className="flex flex-col gap-1">
                <SectionLabel>{bucket.label}</SectionLabel>
                <ul className="flex flex-col">
                  {bucket.entries.map((entry) => (
                    <ListRow
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-2 py-1.5"
                    >
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={entry.checked ?? false}
                          disabled={isPending}
                          aria-label={entry.item?.name ?? "packing item"}
                          onChange={(e) =>
                            run(() => togglePackingItem(entry.id!, e.target.checked, tripId))
                          }
                          className="size-4"
                        />
                        <span className={entry.checked ? "text-muted-foreground line-through" : ""}>
                          {entry.item?.name}
                        </span>
                      </label>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => run(() => removePackingItem(entry.id!, tripId))}
                        aria-label={`Remove ${entry.item?.name} from your kit`}
                        className="text-muted-foreground hover:text-destructive size-7"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </ListRow>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {addable.length > 0 && (
        <select
          aria-label="Add to your kit"
          value=""
          disabled={isPending}
          onChange={(e) => {
            if (e.target.value) run(() => addPackingItem(tripId, e.target.value))
          }}
          className="border-input bg-background h-9 self-start rounded-md border px-3 text-sm"
        >
          <option value="">Add your gear…</option>
          {addable.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
