"use client"

import { useRef, useState, useTransition } from "react"
import { DownloadIcon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  uploadTravelDocumentAttachment,
  deleteTravelDocumentAttachment,
  getTravelDocumentAttachmentUrl,
} from "@/lib/travel-documents/actions"

interface AttachmentActionsProps {
  tripId: string
  documentId: string
  attachmentPath: string | null
  canEdit: boolean
}

export function AttachmentActions({
  tripId,
  documentId,
  attachmentPath,
  canEdit,
}: AttachmentActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File) {
    const formData = new FormData()
    formData.append("file", file)
    setError(null)
    startTransition(async () => {
      const result = await uploadTravelDocumentAttachment(tripId, documentId, formData)
      if (!result.success) {
        setError(result.error)
      }
    })
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleDownload() {
    setError(null)
    const result = await getTravelDocumentAttachmentUrl(documentId)
    if (!result.success) {
      setError(result.error)
      return
    }
    window.open(result.url, "_blank")
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteTravelDocumentAttachment(tripId, documentId)
      if (!result.success) {
        setError(result.error)
      }
    })
  }

  if (attachmentPath) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 px-2 text-xs"
            onClick={handleDownload}
            disabled={isPending}
          >
            <DownloadIcon className="mr-1 size-3" />
            Download
          </Button>
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 px-2 text-xs"
                  disabled={isPending}
                >
                  <Trash2Icon className="mr-1 size-3" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove attachment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The file will be permanently deleted. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    )
  }

  if (!canEdit) return null

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={handleFileInput}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
      />
      <div
        data-testid="drop-zone"
        className={`rounded-md border border-dashed p-2.5 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-center gap-2">
          <PaperclipIcon className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs">Drop a file or</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <UploadIcon className="mr-1 size-3" />
            Upload
          </Button>
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
