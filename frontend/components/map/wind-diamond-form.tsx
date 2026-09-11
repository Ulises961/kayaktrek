"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  WindDiamondFormSchema,
  type WindDiamondForm as WindDiamondFormValues,
} from "@/lib/dtos/wind-diamond"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { FieldLabel, FieldError } from "@/components/common/form-field"

export type WindDiamondFormProps = {
  submitLabel?: string
  isPending?: boolean
  error?: string | null
  // Prefill for editing an existing diamond; omitted for a fresh create.
  values?: WindDiamondFormValues
  onSubmit: (fields: WindDiamondFormValues) => void
  onCancel?: () => void
}

export function WindDiamondForm({
  submitLabel = "Save wind diamond",
  isPending = false,
  error = null,
  values,
  onSubmit,
  onCancel,
}: WindDiamondFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WindDiamondFormValues>({
    resolver: zodResolver(WindDiamondFormSchema),
    defaultValues: { name: "", notes: "" },
    values,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="wind-diamond-name">Name</FieldLabel>
        <Input
          id="wind-diamond-name"
          placeholder="e.g. Funnel off the ridge"
          disabled={isPending}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="wind-diamond-notes">Notes</FieldLabel>
        <Textarea
          id="wind-diamond-notes"
          placeholder="Optional — when it's worst, what to watch for"
          disabled={isPending}
          rows={3}
          {...register("notes")}
        />
        <FieldError message={errors.notes?.message} />
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
