"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, StarIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/dtos/item"
import { confirmItemOwned, deleteItem, toggleDefaultPack } from "@/lib/inventory/actions"
import { Button } from "@/components/ui/button"

interface ItemRowProps {
  item: Item
}

function statusBadgeClass(status: Item["status"]) {
  return status === "owned"
    ? "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]"
    : "bg-[var(--state-planning-bg)] text-[var(--state-planning-fg)]"
}

export function ItemRow({ item }: ItemRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirmOwned() {
    setError(null)
    startTransition(async () => {
      const result = await confirmItemOwned(item.id!)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  function handleDelete() {
    if (!confirm(`Delete “${item.name}” from your gear? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteItem(item.id!)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  function handleToggleDefaultPack() {
    setError(null)
    startTransition(async () => {
      const result = await toggleDefaultPack(item.id!, !item.defaultPack)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{item.name}</span>
          {item.category && (
            <span className="text-muted-foreground text-xs">{item.category.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
              statusBadgeClass(item.status),
            )}
          >
            {item.status ?? "suggested"}
          </span>
          {item.status !== "owned" && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={handleConfirmOwned}>
              <CheckIcon className="size-3.5" /> I own this
            </Button>
          )}
          <Button
            size="icon"
            variant={item.defaultPack ? "default" : "outline"}
            disabled={isPending}
            onClick={handleToggleDefaultPack}
            aria-pressed={!!item.defaultPack}
            aria-label={
              item.defaultPack
                ? `Stop always packing ${item.name} on future trips`
                : `Always pack ${item.name} on future trips`
            }
            title={
              item.defaultPack
                ? "Always packed — click to stop suggesting this on future trips"
                : "Always pack this on future trips"
            }
          >
            <StarIcon className={cn("size-3.5", item.defaultPack && "fill-current")} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={isPending}
            onClick={handleDelete}
            aria-label={`Delete ${item.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </li>
  )
}
