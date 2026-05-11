"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileIcon, PlusIcon } from "lucide-react"
import { createTravelDocument } from "@/lib/travel-documents/actions"
import { TravelDocumentFieldsSchema, TRAVEL_DOCUMENT_TYPES, type TravelDocumentFields } from "@/lib/dtos/travel-document"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { DatePicker } from "@/components/common/date-picker"

const TYPE_LABELS: Record<string, string> = {
  accommodation: "Accommodation",
  transport: "Transport",
  insurance: "Insurance",
  permit: "Permit",
  other: "Other",
}

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </Label>
  )
}

interface AddDocumentDialogProps {
  tripId: string
}

export function AddDocumentDialog({ tripId }: AddDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors } } = useForm<TravelDocumentFields>({
    resolver: zodResolver(TravelDocumentFieldsSchema),
    defaultValues: { type: "accommodation" },
  })

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) reset({ type: "accommodation" })
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createTravelDocument(tripId, data)
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
        <Button variant="outline" size="sm">
          <PlusIcon className="size-3.5" />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="h-1 w-full bg-[#2aa8a0]" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileIcon className="size-4 text-[#2aa8a0]" />
              Add travel document
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="type">Type</FieldLabel>
                <select
                  id="type"
                  disabled={isPending}
                  className={SELECT_CLASS}
                  {...register("type")}
                >
                  {TRAVEL_DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  placeholder="Document name"
                  disabled={isPending}
                  {...register("name")}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Date</FieldLabel>
                <DatePicker
                  value={watch("date") ?? ""}
                  onChange={(v) => setValue("date", v)}
                  placeholder="Service date"
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Expiry date</FieldLabel>
                <DatePicker
                  value={watch("expiryDate") ?? ""}
                  onChange={(v) => setValue("expiryDate", v)}
                  placeholder="Expiry date"
                  disabled={isPending}
                />
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
                <Input
                  id="url"
                  placeholder="Booking link"
                  disabled={isPending}
                  {...register("url")}
                />
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

            {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>Add</Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
