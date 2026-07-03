"use client"

import { useState, useTransition } from "react"
import { FileIcon } from "lucide-react"
import { updateTravelDocument } from "@/lib/travel-documents/actions"
import type { TravelDocument, TravelDocumentFields } from "@/lib/dtos/travel-document"
import { palette } from "@/lib/tokens"
import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { FieldLabel } from "@/components/common/form-field"
import { AttachmentActions } from "@/components/logistics/attachment-actions"
import { DocumentForm } from "@/components/logistics/document-form"

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(fields: TravelDocumentFields) {
    startTransition(async () => {
      const result = await updateTravelDocument(tripId, document.id!, fields)
      if (result.success) {
        onOpenChange(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AccentDialogContent accent={palette.foam400} icon={FileIcon} title="Edit document">
        <DocumentForm
          submitLabel="Save"
          isPending={isPending}
          error={error}
          values={{
            type: document.type,
            name: document.name,
            date: document.date ?? "",
            expiryDate: document.expiryDate ?? "",
            confirmationNumber: document.confirmationNumber ?? "",
            url: document.url ?? "",
            notes: document.notes ?? "",
          }}
          attachmentSlot={
            document.id ? (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Attachment</FieldLabel>
                <AttachmentActions
                  tripId={tripId}
                  documentId={document.id}
                  attachmentPath={document.attachmentPath ?? null}
                  canEdit={true}
                />
              </div>
            ) : undefined
          }
          onSubmit={handleSubmit}
        />
      </AccentDialogContent>
    </Dialog>
  )
}
