"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/dtos/item"
import type { ItemCategory } from "@/lib/dtos/item-category"
import { createItem } from "@/lib/inventory/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface GearClosetProps {
  items: Item[]
  categories: ItemCategory[]
}

const UNCATEGORISED = "__none__"

function statusBadgeClass(status: Item["status"]) {
  return status === "owned"
    ? "bg-[var(--state-happening-bg)] text-[var(--state-happening-fg)]"
    : "bg-[var(--state-planning-bg)] text-[var(--state-planning-fg)]"
}

export function GearCloset({ items, categories }: GearClosetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<string>("all")
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (filter === "all") return items
    return items.filter((i) => (i.category?.slug ?? UNCATEGORISED) === filter)
  }, [items, filter])

  function onAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const result = await createItem({ name: trimmed, categoryId: categoryId || undefined })
      if (result.success) {
        setName("")
        setCategoryId("")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onAdd()
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add gear (e.g. spare paddle)"
          disabled={isPending}
          className="sm:max-w-xs"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={isPending}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-destructive text-sm">{error}</p>}

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No gear yet. Add your first piece of kit above to start your gear closet.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterChip>
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.slug}
                onClick={() => setFilter(c.slug)}
              >
                {c.name}
              </FilterChip>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{item.name}</span>
                  {item.category && (
                    <span className="text-muted-foreground text-xs">{item.category.name}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
                    statusBadgeClass(item.status),
                  )}
                >
                  {item.status ?? "suggested"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "bg-sky-100 text-blue-600"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}
