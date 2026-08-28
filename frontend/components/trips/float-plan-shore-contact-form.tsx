"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertLogistics } from "@/lib/logistics/actions"
import { LogisticsFieldsSchema, type Logistics } from "@/lib/dtos/logistics"

const ShoreContactFormSchema = LogisticsFieldsSchema.pick({
  shoreContactName: true,
  shoreContactEmail: true,
  shoreContactPhone: true,
  shoreContactRelationship: true,
})
type ShoreContactFormValues = z.infer<typeof ShoreContactFormSchema>

interface ShoreContactFormProps {
  tripId: string
  logistics: Logistics | null
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    // Stacked at base, side by side from sm — same reasoning as the crew manifest's row.
    // The shore contact's email is the value that forces it: no break opportunity, so it
    // needs the full row width at 320 rather than what is left beside a fixed label.
    <div className="flex flex-col gap-0.5 text-base sm:flex-row sm:gap-2">
      <span className="text-muted-foreground sm:w-28 sm:shrink-0">{label}</span>
      <span className="min-w-0 font-medium break-words">{value}</span>
    </div>
  )
}

export function ShoreContactForm({ tripId, logistics }: ShoreContactFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [displayed, setDisplayed] = useState<ShoreContactFormValues>({
    shoreContactName: logistics?.shoreContactName ?? "",
    shoreContactEmail: logistics?.shoreContactEmail ?? "",
    shoreContactPhone: logistics?.shoreContactPhone ?? "",
    shoreContactRelationship: logistics?.shoreContactRelationship ?? "",
  })

  const { register, handleSubmit, reset } = useForm<ShoreContactFormValues>({
    resolver: zodResolver(ShoreContactFormSchema),
    defaultValues: {
      shoreContactName: logistics?.shoreContactName ?? "",
      shoreContactEmail: logistics?.shoreContactEmail ?? "",
      shoreContactPhone: logistics?.shoreContactPhone ?? "",
      shoreContactRelationship: logistics?.shoreContactRelationship ?? "",
    },
  })

  function handleEdit() {
    setError(null)
    setIsEditing(true)
  }

  function handleCancel() {
    reset({
      shoreContactName: displayed.shoreContactName ?? "",
      shoreContactEmail: displayed.shoreContactEmail ?? "",
      shoreContactPhone: displayed.shoreContactPhone ?? "",
      shoreContactRelationship: displayed.shoreContactRelationship ?? "",
    })
    setError(null)
    setIsEditing(false)
  }

  function onSubmit(values: ShoreContactFormValues) {
    setError(null)
    startTransition(async () => {
      const result = await upsertLogistics(tripId, values)
      if (!result.success) {
        setError(result.error)
        return
      }
      setDisplayed(values)
      setIsEditing(false)
    })
  }

  if (!isEditing) {
    const { shoreContactName, shoreContactEmail, shoreContactPhone, shoreContactRelationship } =
      displayed
    const hasAny =
      shoreContactName || shoreContactPhone || shoreContactEmail || shoreContactRelationship

    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {hasAny ? (
            <>
              <FieldRow label="Name" value={shoreContactName} />
              <FieldRow label="Relationship" value={shoreContactRelationship} />
              <FieldRow label="Phone" value={shoreContactPhone} />
              <FieldRow label="Email" value={shoreContactEmail} />
            </>
          ) : (
            <p className="text-muted-foreground text-base italic">No shore contact recorded.</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleEdit} className="shrink-0 print:hidden">
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scName">Name</Label>
          <Input id="scName" disabled={isPending} {...register("shoreContactName")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scEmail">Email</Label>
          <Input
            id="scEmail"
            type="email"
            disabled={isPending}
            {...register("shoreContactEmail")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scPhone">Phone</Label>
          <Input id="scPhone" type="tel" disabled={isPending} {...register("shoreContactPhone")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scRelationship">Relationship</Label>
          <Input
            id="scRelationship"
            placeholder="e.g. Partner"
            disabled={isPending}
            {...register("shoreContactRelationship")}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </form>
  )
}
