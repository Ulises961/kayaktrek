"use client"

import { useRef, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileIcon, PaperclipIcon, PlusIcon, XIcon } from "lucide-react"
import { createTravelDocument, uploadTravelDocumentAttachment } from "@/lib/travel-documents/actions"
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, setValue, control, setError, reset, formState: { errors } } = useForm<TravelDocumentFields>({
    resolver: zodResolver(TravelDocumentFieldsSchema),
    defaultValues: { type: "accommodation" },
  })
  const watchDate = useWatch({ control, name: "date" })
  const watchExpiryDate = useWatch({ control, name: "expiryDate" })

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) {
      reset({ type: "accommodation" })
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function clearFile() {
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createTravelDocument(tripId, data)
      if (!result.success) {
        setError("root", { message: result.error })
        return
      }
      if (pendingFile && result.document.id) {
        const formData = new FormData()
        formData.append("file", pendingFile)
        const uploadResult = await uploadTravelDocumentAttachment(tripId, result.document.id, formData)
        if (!uploadResult.success) {
          setError("root", { message: "Document saved, but the file could not be uploaded. Add it from the edit dialog." })
          setOpen(false)
          return
        }
      }
      setOpen(false)
    })
  })

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
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
                {errors.expiryDate && <p className="text-xs text-destructive">{errors.expiryDate.message}</p>}
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

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Attachment (optional)</FieldLabel>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                >
                  <PaperclipIcon className="size-3.5" />
                  Choose file
                </Button>
                {pendingFile ? (
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground truncate">{pendingFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5 shrink-0"
                      onClick={clearFile}
                      disabled={isPending}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No file chosen</span>
                )}
              </div>
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
