"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TripRequirement } from "@/lib/dtos/inventory"
import type { ItemCategory } from "@/lib/dtos/item-category"
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
import { NativeSelect } from "@/components/common/form-field"
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
  /** Resolves a requirement's stored category slug to the name its group is headed with. */
  categories: ItemCategory[]
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

interface StatusMarkProps {
  status: TripRequirement["status"]
  className?: string
}

// The phone-width stand-in for the status pill: a fixed icon ahead of the name, so the status
// sits in the same place whatever the name's length.
function StatusMark({ status, className }: StatusMarkProps) {
  const label = status ?? "needed"
  const Icon = status === "covered" ? CircleCheckIcon : CircleAlertIcon
  return (
    <Icon
      role="img"
      aria-label={label}
      className={cn(
        "size-4 shrink-0",
        status === "covered" ? "text-foam" : "text-[var(--state-planning-fg)]",
        className,
      )}
    />
  )
}

export function RequirementsChecklist({
  inventoryId,
  tripId,
  requirements,
  categories,
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
        { name: trimmed, category: category || undefined },
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
        // Grouped by the stored category: a slug from the select above, or the free text older
        // requirements and other clients carry (see lib/inventory/format).
        <div className="flex flex-col gap-4">
          {bucketByCategory(requirements, (r) => r.category, categories).map((bucket) => (
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
          <NativeSelect
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isPending}
            className="sm:max-w-[10rem]"
          >
            <option value="">No category</option>
            {categories.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="order-1 flex min-w-0 flex-1 items-start gap-2">
          <StatusMark status={req.status} className="mt-0.5 sm:hidden" />
          <span className="min-w-0 text-sm font-medium break-words">{req.name}</span>
        </div>
        {/* Below sm the remove cross stays at the end of the name line and Withdraw takes the
            line under it; from sm the order is name, status, Withdraw, remove. */}
        <span
          className={cn(
            "hidden items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase sm:order-2 sm:inline-flex",
            statusBadgeClass(req.status),
          )}
        >
          {req.status ?? "needed"}
        </span>
        {canManage && myContribution && (
          <div className="order-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleWithdraw}
              className="touch-target h-6 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
            >
              Withdraw
            </Button>
          </div>
        )}
        {canManage && isProposer && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={isPending}
                aria-label={`Remove ${req.name}`}
                className="text-muted-foreground hover:text-destructive order-2 sm:order-4"
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
