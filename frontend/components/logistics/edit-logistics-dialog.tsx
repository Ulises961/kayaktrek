"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, PencilIcon } from "lucide-react"
import { upsertLogistics } from "@/lib/logistics/actions"
import { LogisticsFieldsSchema, type LogisticsFields, type Logistics } from "@/lib/dtos/logistics"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"

interface EditLogisticsDialogProps {
  tripId: string
  logistics: Logistics | null
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </Label>
  )
}

export function EditShoreContactDialog({ tripId, logistics }: EditLogisticsDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<LogisticsFields>({
    resolver: zodResolver(LogisticsFieldsSchema),
    defaultValues: {
      shoreContactName: logistics?.shoreContactName ?? "",
      shoreContactEmail: logistics?.shoreContactEmail ?? "",
      shoreContactPhone: logistics?.shoreContactPhone ?? "",
      shoreContactRelationship: logistics?.shoreContactRelationship ?? "",
    },
  })

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) reset({
      shoreContactName: logistics?.shoreContactName ?? "",
      shoreContactEmail: logistics?.shoreContactEmail ?? "",
      shoreContactPhone: logistics?.shoreContactPhone ?? "",
      shoreContactRelationship: logistics?.shoreContactRelationship ?? "",
    })
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
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PencilIcon className="size-3.5" />
          Edit contact
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        {/* Accent bar */}
        <div className="h-1 w-full bg-[#d97706]" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AnchorIcon className="size-4 text-[#d97706]" />
              Edit Shore Contact
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            {/* Shore contact */}
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/20 p-3">
              <div className="grid grid-cols-2 gap-3">
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
                  {errors.shoreContactEmail && <p className="text-xs text-destructive">{errors.shoreContactEmail.message}</p>}
                </div>
              </div>
            </div>

            {errors.root && (
              <p className="text-sm text-destructive">{errors.root.message}</p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>Save</Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
