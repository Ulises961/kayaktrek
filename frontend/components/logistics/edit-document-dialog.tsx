"use client"

import { useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileIcon } from "lucide-react"
import { updateTravelDocument } from "@/lib/travel-documents/actions"
import {
  TravelDocumentFieldsSchema,
  TRAVEL_DOCUMENT_TYPES,
  type TravelDocumentFields,
  type TravelDocument,
} from "@/lib/dtos/travel-document"
import { AttachmentActions } from "@/components/logistics/attachment-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
    <Label
      htmlFor={htmlFor}
      className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase"
    >
      {children}
    </Label>
  )
}

interface EditDocumentDialogProps {
  tripId: string
  document: TravelDocument
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditDocumentDialog({
  tripId,
  document,
  open,
  onOpenChange,
}: EditDocumentDialogProps) {
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    control,
    setError,
    formState: { errors },
  } = useForm<TravelDocumentFields>({
    resolver: zodResolver(TravelDocumentFieldsSchema),
    values: {
      type: document.type,
      name: document.name,
      date: document.date ?? "",
      expiryDate: document.expiryDate ?? "",
      confirmationNumber: document.confirmationNumber ?? "",
      url: document.url ?? "",
      notes: document.notes ?? "",
    },
  })
  const watchDate = useWatch({ control, name: "date" })
  const watchExpiryDate = useWatch({ control, name: "expiryDate" })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateTravelDocument(tripId, document.id!, data)
      if (result.success) {
        onOpenChange(false)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="h-1 w-full bg-[#2aa8a0]" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileIcon className="size-4 text-[#2aa8a0]" />
              Edit document
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
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  placeholder="Document name"
                  disabled={isPending}
                  {...register("name")}
                />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
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
                {errors.expiryDate && (
                  <p className="text-destructive text-xs">{errors.expiryDate.message}</p>
                )}
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

            {document.id && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Attachment</FieldLabel>
                <AttachmentActions
                  tripId={tripId}
                  documentId={document.id}
                  attachmentPath={document.attachmentPath ?? null}
                  canEdit={true}
                />
              </div>
            )}

            {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
