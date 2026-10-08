"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, PencilIcon } from "lucide-react"
import { upsertLogistics } from "@/lib/logistics/actions"
import { LogisticsFieldsSchema, type LogisticsFields, type Logistics } from "@/lib/dtos/logistics"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { FieldLabel, FieldError } from "@/components/common/form-field"

interface EditLogisticsDialogProps {
  tripId: string
  logistics: Logistics | null
}

function shoreContactValues(logistics: Logistics | null): LogisticsFields {
  return {
    shoreContactName: logistics?.shoreContactName ?? "",
    shoreContactEmail: logistics?.shoreContactEmail ?? "",
    shoreContactPhone: logistics?.shoreContactPhone ?? "",
    shoreContactRelationship: logistics?.shoreContactRelationship ?? "",
  }
}

export function EditShoreContactDialog({ tripId, logistics }: EditLogisticsDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LogisticsFields>({
    resolver: zodResolver(LogisticsFieldsSchema),
    defaultValues: shoreContactValues(logistics),
  })

  // The form lives outside the dialog, so it outlasts the page's data: if someone else
  // changed the contact since the page loaded (M36), opening on the load-time values and
  // saving would put the old contact back — and this is who gets the missed-checkpoint
  // alert. Start from what the server has now each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) reset(shoreContactValues(logistics))
    setOpen(next)
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await upsertLogistics(tripId, data)
      if (result.success) {
        setOpen(false)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PencilIcon className="size-3.5" />
          Edit contact
        </Button>
      </DialogTrigger>
      <AccentDialogContent icon={AnchorIcon} title="Edit Shore Contact">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {/* Shore contact */}
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-800/30 dark:bg-amber-950/20">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="shoreContactName">Shore contact name</FieldLabel>
                <Input
                  id="shoreContactName"
                  placeholder="Shore contact name"
                  disabled={isPending}
                  {...register("shoreContactName")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="shoreContactRelationship">Relationship</FieldLabel>
                <Input
                  id="shoreContactRelationship"
                  placeholder="Partner, family, friend…"
                  disabled={isPending}
                  {...register("shoreContactRelationship")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="shoreContactPhone">Phone</FieldLabel>
                <Input
                  id="shoreContactPhone"
                  placeholder="+34 600 000 000"
                  disabled={isPending}
                  {...register("shoreContactPhone")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="shoreContactEmail">Email</FieldLabel>
                <Input
                  id="shoreContactEmail"
                  type="email"
                  placeholder="email@example.com"
                  disabled={isPending}
                  {...register("shoreContactEmail")}
                />
                <FieldError message={errors.shoreContactEmail?.message} />
              </div>
            </div>
          </div>

          {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </AccentDialogContent>
    </Dialog>
  )
}
