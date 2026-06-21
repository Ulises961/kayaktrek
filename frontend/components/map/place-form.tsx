"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlaceFormSchema, type PlaceForm as PlaceFormValues } from "@/lib/dtos/place"
import type { PlaceCategory } from "@/lib/dtos/place"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase"
    >
      {children}
    </Label>
  )
}

export type PlaceFormProps = {
  categories: PlaceCategory[]
  submitLabel?: string
  isPending?: boolean
  error?: string | null
  // Prefill for editing an existing place; omitted for a fresh create.
  values?: PlaceFormValues
  onSubmit: (fields: PlaceFormValues) => void
  onCancel?: () => void
}

export function PlaceForm({
  categories,
  submitLabel = "Save place",
  isPending = false,
  error = null,
  values,
  onSubmit,
  onCancel,
}: PlaceFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlaceFormValues>({
    resolver: zodResolver(PlaceFormSchema),
    defaultValues: { categoryId: categories[0]?.id ?? "", label: "", note: "" },
    values,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="place-category">Category</FieldLabel>
        <select
          id="place-category"
          disabled={isPending}
          className={SELECT_CLASS}
          {...register("categoryId")}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="text-destructive text-xs">{errors.categoryId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="place-label">Label</FieldLabel>
        <Input
          id="place-label"
          placeholder="e.g. Freshwater spring"
          disabled={isPending}
          {...register("label")}
        />
        {errors.label && <p className="text-destructive text-xs">{errors.label.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="place-note">Note</FieldLabel>
        <Textarea
          id="place-note"
          placeholder="Optional — access, conditions, anything worth remembering"
          disabled={isPending}
          rows={3}
          {...register("note")}
        />
        {errors.note && <p className="text-destructive text-xs">{errors.note.message}</p>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
