"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlaceFormSchema, type PlaceForm as PlaceFormValues } from "@/lib/dtos/place"
import type { PlaceCategory } from "@/lib/dtos/place"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { FieldLabel, FieldError, NativeSelect } from "@/components/common/form-field"

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
        <NativeSelect id="place-category" disabled={isPending} {...register("categoryId")}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError message={errors.categoryId?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="place-label">Label</FieldLabel>
        <Input
          id="place-label"
          placeholder="e.g. Freshwater spring"
          disabled={isPending}
          {...register("label")}
        />
        <FieldError message={errors.label?.message} />
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
        <FieldError message={errors.note?.message} />
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
