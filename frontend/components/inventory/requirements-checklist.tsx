"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TripRequirement } from "@/lib/dtos/inventory"
import type { Item } from "@/lib/dtos/item"
import {
  addRequirement,
  removeRequirement,
  contributeItem,
  unclaimRequirement,
  type InventoryActionResult,
} from "@/lib/inventory/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RequirementsChecklistProps {
  inventoryId: string
  tripId: string
  requirements: TripRequirement[]
  myItems: Item[]
  /** Whether the current user is a trip member (may add requirements / contribute). */
  canManage: boolean
  /** The current user's id — drives proposer-gated remove and own-contribution withdraw. */
  currentUserId?: string
}

function statusBadgeClass(status: TripRequirement["status"]) {
  return status === "covered"
    ? "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]"
    : "bg-[var(--state-planning-bg)] text-[var(--state-planning-fg)]"
}

export function RequirementsChecklist({
  inventoryId,
  tripId,
  requirements,
  myItems,
  canManage,
  currentUserId,
}: RequirementsChecklistProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [error, setError] = useState<string | null>(null)

  const ownedItems = myItems.filter((i) => i.status === "owned")

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const result = await addRequirement(
        inventoryId,
        { name: trimmed, category: category.trim() || undefined },
        tripId,
      )
      if (result.success) {
        setName("")
        setCategory("")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {requirements.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          No requirements yet{canManage ? " — add the gear this trip needs below." : "."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requirements.map((req) => (
            <RequirementRow
              key={req.id}
              inventoryId={inventoryId}
              tripId={tripId}
              requirement={req}
              ownedItems={ownedItems}
              canManage={canManage}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAdd()
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a requirement (e.g. flares)"
            disabled={isPending}
            className="sm:max-w-xs"
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            disabled={isPending}
            className="sm:max-w-[10rem]"
          />
          <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
            Add
          </Button>
        </form>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}

interface RequirementRowProps {
  inventoryId: string
  tripId: string
  requirement: TripRequirement
  ownedItems: Item[]
  canManage: boolean
  currentUserId?: string
}

function RequirementRow({
  inventoryId,
  tripId,
  requirement: req,
  ownedItems,
  canManage,
  currentUserId,
}: RequirementRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const contributions = req.contributions ?? []
  const myContribution = currentUserId
    ? contributions.find((c) => c.member?.user?.id === currentUserId)
    : undefined
  const isProposer = !!currentUserId && req.proposedBy?.user?.id === currentUserId

  function run(fn: () => Promise<InventoryActionResult>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  function handleContribute(itemId: string) {
    if (!itemId) return
    run(() => contributeItem(inventoryId, req.id!, itemId, tripId))
  }

  function handleWithdraw() {
    run(() => unclaimRequirement(inventoryId, req.id!, tripId))
  }

  function handleRemove() {
    if (!confirm(`Remove “${req.name}” from the inventory?`)) return
    run(() => removeRequirement(inventoryId, req.id!, tripId))
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{req.name}</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
              statusBadgeClass(req.status),
            )}
          >
            {req.status ?? "needed"}
          </span>
          {canManage && myContribution && (
            <Button variant="outline" size="sm" disabled={isPending} onClick={handleWithdraw}>
              Withdraw
            </Button>
          )}
          {canManage && isProposer && (
            <Button
              size="icon"
              variant="ghost"
              disabled={isPending}
              onClick={handleRemove}
              aria-label={`Remove ${req.name}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {contributions.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {contributions.map((c) => (
            <li key={c.id} className="text-muted-foreground text-xs">
              {c.item?.name}
              {c.member?.user?.name && ` · ${c.member.user.name}`}
            </li>
          ))}
        </ul>
      )}

      {canManage &&
        !myContribution &&
        (ownedItems.length > 0 ? (
          <select
            aria-label={`Contribute to ${req.name}`}
            value=""
            disabled={isPending}
            onChange={(e) => handleContribute(e.target.value)}
            className="border-input bg-background h-9 self-start rounded-md border px-3 text-sm"
          >
            <option value="">Contribute your gear…</option>
            {ownedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-muted-foreground text-xs">
            You have no owned gear to contribute — confirm some in your gear closet first.
          </p>
        ))}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </li>
  )
}
