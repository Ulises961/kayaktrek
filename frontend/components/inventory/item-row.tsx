"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PackagePlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/dtos/item"
import { setItemOwned, deleteItem, toggleDefaultPack } from "@/lib/inventory/actions"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ListRow } from "@/components/common/list-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ItemRowProps {
  item: Item
}

export function ItemRow({ item }: ItemRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const owned = item.status === "owned"

  // One control that both displays and sets owned state (M12 §F) — replaces the
  // old SUGGESTED/OWNED badge chip + separate "I own this" button pair.
  function handleOwnedChange(next: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setItemOwned(item.id!, next)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  function handleDelete() {
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
    <ListRow className="flex flex-col gap-1 px-2 py-1.5">
      <div className="flex items-center justify-between gap-3">
        {/* Smaller at base so the name, its category and the row's controls fit a 320px
            row without wrapping; full size once there is width for it. */}
        <span className={cn("text-xs font-medium sm:text-sm", !owned && "text-muted-foreground")}>
          {item.name}
        </span>
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px]">
            Owned
            <Switch
              checked={owned}
              disabled={isPending}
              onCheckedChange={handleOwnedChange}
              aria-label={owned ? `Mark ${item.name} as not owned` : `Mark ${item.name} as owned`}
            />
          </label>
          <Button
            size="icon"
            variant={item.defaultPack ? "default" : "outline"}
            disabled={isPending}
            onClick={handleToggleDefaultPack}
            aria-pressed={!!item.defaultPack}
            aria-label={
              item.defaultPack
                ? `Remove ${item.name} from trip checklist`
                : `Add ${item.name} to trip checklist`
            }
            title={
              item.defaultPack
                ? "On trip checklist — click to remove from future trips"
                : "Add to trip checklist"
            }
            className="size-7"
          >
            <PackagePlusIcon className="size-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={isPending}
                aria-label={`Delete ${item.name}`}
                className="text-muted-foreground hover:text-destructive size-7"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete “{item.name}” from your gear. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isPending}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </ListRow>
  )
}
