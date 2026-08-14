"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import type { CatalogItem } from "@/lib/dtos/catalog-item"
import type { ItemCategory } from "@/lib/dtos/item-category"
import {
  createCatalogItem,
  deleteCatalogItem,
  resetCatalogToDefault,
} from "@/lib/inventory/catalog-actions"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { Input } from "@/components/ui/input"
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

interface CatalogKitSectionProps {
  items: CatalogItem[]
  categories: ItemCategory[]
}

export function CatalogKitSection({ items, categories }: CatalogKitSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const result = await createCatalogItem({ name: trimmed, categoryId: categoryId || undefined })
      if (result.success) {
        setName("")
        setCategoryId("")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleRemove(item: CatalogItem) {
    setError(null)
    startTransition(async () => {
      const result = await deleteCatalogItem(item.id!)
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  function handleStartFromDefault() {
    setError(null)
    startTransition(async () => {
      const result = await resetCatalogToDefault()
      if (result.success) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Default trip kit</h2>
        <p className="text-muted-foreground text-sm">
          The shared gear your trips start with — new trips you lead seed their requirement
          checklist from this list instead of the global defaults.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="mb-3">
            No default trip kit yet — new trips fall back to the global default checklist.
          </p>
          <Button size="sm" variant="outline" disabled={isPending} onClick={handleStartFromDefault}>
            Start from the default list
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <ListRow key={item.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{item.name}</span>
                {item.category && (
                  <span className="text-muted-foreground text-xs">{item.category.name}</span>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={isPending}
                    aria-label={`Remove ${item.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove “{item.name}” from your default trip kit. New trips you lead
                      will no longer seed it automatically.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRemove(item)}
                      disabled={isPending}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </ListRow>
          ))}
        </ul>
      )}

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
          placeholder="Add to default trip kit (e.g. spare paddle)"
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
    </div>
  )
}
