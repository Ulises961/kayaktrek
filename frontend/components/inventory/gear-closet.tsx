"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/dtos/item"
import type { ItemCategory } from "@/lib/dtos/item-category"
import { createItem } from "@/lib/inventory/actions"
import { ItemRow } from "@/components/inventory/item-row"
import { ctaButtonClass } from "@/components/common/button-roles"
import { SectionLabel } from "@/components/common/section-label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/common/empty-state"
import { PocketKnifeIcon } from "lucide-react"

interface GearClosetProps {
  items: Item[]
  categories: ItemCategory[]
}

const UNCATEGORISED = "__none__"

type CategoryGroup = { slug: string; label: string; items: Item[] }

// Buckets items by category slug in the given category order, with an explicit
// trailing "Uncategorised" bucket — the grouped closet reads by category
// section instead of one flat list (M12 §F density pass).
function groupByCategory(items: Item[], categories: ItemCategory[]): CategoryGroup[] {
  const groups: CategoryGroup[] = categories.map((c) => ({
    slug: c.slug,
    label: c.name,
    items: items.filter((i) => i.category?.slug === c.slug),
  }))
  groups.push({
    slug: UNCATEGORISED,
    label: "Uncategorised",
    items: items.filter((i) => !i.category?.slug),
  })
  return groups.filter((g) => g.items.length > 0)
}

export function GearCloset({ items, categories }: GearClosetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<string>("all")
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => {
    const all = groupByCategory(items, categories)
    if (filter === "all") return all
    return all.filter((g) => g.slug === filter)
  }, [items, categories, filter])

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
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !name.trim()}
          className={ctaButtonClass}
        >
          Add
        </Button>
      </form>
      {error && <p className="text-destructive text-sm">{error}</p>}

      {items.length === 0 ? (
        <EmptyState
          icon={PocketKnifeIcon}
          title="No gear yet"
          description="Kit you own lands here, ready to add to any trip's packing list. Add your first piece above."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <FilterChip key={c.id} active={filter === c.slug} onClick={() => setFilter(c.slug)}>
                {c.name}
              </FilterChip>
            ))}
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterChip>
          </div>

          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <section key={group.slug} className="flex flex-col gap-1.5">
                <SectionLabel>{group.label}</SectionLabel>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
        // "This filter is on" is the same statement a selected nav item makes, so it
        // takes the same token rather than a raw sky/blue pair with no dark mode.
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}
