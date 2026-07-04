"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  TravelDocumentFieldsSchema,
  TRAVEL_DOCUMENT_TYPES,
  type TravelDocumentFields,
  type TravelDocumentType,
} from "@/lib/dtos/travel-document"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DialogFooter } from "@/components/ui/dialog"
import { DatePicker } from "@/components/common/date-picker"
import { FieldLabel, FieldError, NativeSelect } from "@/components/common/form-field"

const TYPE_LABELS: Record<TravelDocumentType, string> = {
  accommodation: "Accommodation",
  transport: "Transport",
  insurance: "Insurance",
  permit: "Permit",
  other: "Other",
}

export type DocumentFormProps = {
  submitLabel?: string
  isPending?: boolean
  error?: string | null
  // Prefill for editing an existing document; omitted for a fresh create.
  values?: TravelDocumentFields
  // Attachment UI differs between create (pending file picker) and edit
  // (uploaded-file actions), so each dialog supplies its own.
  attachmentSlot?: React.ReactNode
  onSubmit: (fields: TravelDocumentFields) => void
}

export function DocumentForm({
  submitLabel = "Save",
  isPending = false,
  error = null,
  values,
  attachmentSlot,
  onSubmit,
}: DocumentFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<TravelDocumentFields>({
    resolver: zodResolver(TravelDocumentFieldsSchema),
    defaultValues: { type: "accommodation" },
    values,
  })
  const watchDate = useWatch({ control, name: "date" })
  const watchExpiryDate = useWatch({ control, name: "expiryDate" })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="type">Type</FieldLabel>
          <NativeSelect id="type" disabled={isPending} {...register("type")}>
            {TRAVEL_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.type?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" placeholder="Document name" disabled={isPending} {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Date</FieldLabel>
          <DatePicker
            value={watchDate ?? ""}
            onChange={(v) => setValue("date", v, { shouldValidate: true })}
            placeholder="Service date"
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Expiry date</FieldLabel>
          <DatePicker
            value={watchExpiryDate ?? ""}
            onChange={(v) => setValue("expiryDate", v, { shouldValidate: true })}
            placeholder="Expiry date"
            disabled={isPending}
          />
          <FieldError message={errors.expiryDate?.message} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="confirmationNumber">Confirmation #</FieldLabel>
          <Input
            id="confirmationNumber"
            placeholder="Ref / booking number"
            disabled={isPending}
            {...register("confirmationNumber")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="url">URL</FieldLabel>
          <Input id="url" placeholder="Booking link" disabled={isPending} {...register("url")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Textarea
          id="notes"
          placeholder="Additional notes…"
          rows={2}
          disabled={isPending}
          {...register("notes")}
        />
      </div>

      {attachmentSlot}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
