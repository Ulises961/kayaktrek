"use client"

import { useRef, useState, useTransition } from "react"
import { FileIcon, PaperclipIcon, PlusIcon, XIcon } from "lucide-react"
import {
  createTravelDocument,
  uploadTravelDocumentAttachment,
} from "@/lib/travel-documents/actions"
import type { TravelDocumentFields } from "@/lib/dtos/travel-document"
import { palette } from "@/lib/tokens"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { FieldLabel } from "@/components/common/form-field"
import { DocumentForm } from "@/components/logistics/document-form"

interface AddDocumentDialogProps {
  tripId: string
}

export function AddDocumentDialog({ tripId }: AddDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) {
      setError(null)
      clearFile()
    }
  }

  function clearFile() {
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleSubmit(fields: TravelDocumentFields) {
    startTransition(async () => {
      const result = await createTravelDocument(tripId, fields)
      if (!result.success) {
        setError(result.error)
        return
      }
      if (pendingFile && result.document.id) {
        const formData = new FormData()
        formData.append("file", pendingFile)
        const uploadResult = await uploadTravelDocumentAttachment(
          tripId,
          result.document.id,
          formData,
        )
        if (!uploadResult.success) {
          setError(
            "Document saved, but the file could not be uploaded. Add it from the edit dialog.",
          )
          setOpen(false)
          return
        }
      }
      setOpen(false)
    })
  }

  const attachmentSlot = (
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
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="text-muted-foreground truncate text-xs">{pendingFile.name}</span>
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
          <span className="text-muted-foreground text-xs">No file chosen</span>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PlusIcon className="size-3.5" />
          Add document
        </Button>
      </DialogTrigger>
      <AccentDialogContent accent={palette.foam400} icon={FileIcon} title="Add travel document">
        <DocumentForm
          submitLabel="Add"
          isPending={isPending}
          error={error}
          attachmentSlot={attachmentSlot}
          onSubmit={handleSubmit}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
