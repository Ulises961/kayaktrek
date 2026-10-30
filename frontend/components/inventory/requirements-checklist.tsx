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
import { ctaButtonClass } from "@/components/common/button-roles"
import { Input } from "@/components/ui/input"
import { ListRow } from "@/components/common/list-row"
import { SectionLabel } from "@/components/common/section-label"
import { UserAvatar } from "@/components/common/user-avatar"
import { bucketByCategory } from "@/lib/inventory/format"
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
import { EmptyState } from "@/components/common/empty-state"

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

  // Items I've already contributed to some other requirement in this trip drop
  // out of the picker — one physical item can't cover two requirements at
  // once, and the list must recompute as contributions change (§4 fix).
  const contributedItemIds = new Set(
    requirements.flatMap((r) =>
      (r.contributions ?? [])
        .filter((c) => c.member?.user?.id === currentUserId)
        .map((c) => c.item?.id)
        .filter((id): id is string => !!id),
    ),
  )
  const availableItems = ownedItems.filter((i) => !i.id || !contributedItemIds.has(i.id))

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
        <EmptyState
          variant="inline"
          className="italic"
          title={`No requirements yet${canManage ? " — add the gear this trip needs below." : "."}`}
        />
      ) : (
        // Grouped by the free-text category (trimmed + case-folded — see
        // lib/inventory/format's known rough edge vs the ItemCategory FK).
        <div className="flex flex-col gap-4">
          {bucketByCategory(requirements, (r) => r.category).map((bucket) => (
            <section key={bucket.key || "__uncategorised__"} className="flex flex-col gap-1">
              <SectionLabel>{bucket.label}</SectionLabel>
              <ul className="flex flex-col">
                {bucket.entries.map((req) => (
                  <RequirementRow
                    key={req.id}
                    inventoryId={inventoryId}
                    tripId={tripId}
                    requirement={req}
                    ownedItems={availableItems}
                    canManage={canManage}
                    currentUserId={currentUserId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
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
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !name.trim()}
            className={ctaButtonClass}
          >
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
    run(() => removeRequirement(inventoryId, req.id!, tripId))
  }

  return (
    <ListRow className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 text-sm font-medium break-words">{req.name}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
              statusBadgeClass(req.status),
            )}
          >
            {req.status ?? "needed"}
          </span>
          {canManage && myContribution && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleWithdraw}
              className="touch-target h-6 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
            >
              Withdraw
            </Button>
          )}
          {canManage && isProposer && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isPending}
                  aria-label={`Remove ${req.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {req.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove “{req.name}” from the inventory. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemove}
                    disabled={isPending}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {contributions.length > 0 && (
        // Contributors as a stacked avatar row (LogCard's endorser idiom) — the
        // covered/needed badge stays the row's primary status element.
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="flex -space-x-1.5">
            {contributions.map((c) => (
              <span
                key={c.id}
                title={[c.member?.user?.name, c.item?.name].filter(Boolean).join(" — ")}
              >
                <UserAvatar
                  name={c.member?.user?.name ?? "?"}
                  size="sm"
                  className="ring-background !size-5 ring-2"
                />
              </span>
            ))}
          </span>
          <span className="truncate">
            {contributions
              .map((c) => c.item?.name)
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
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
    </ListRow>
  )
}
