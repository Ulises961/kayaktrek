"use client"

import { useTransition } from "react"
import { Trash2Icon } from "lucide-react"
import { deleteTravelDocument } from "@/lib/travel-documents/actions"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteDocumentButtonProps {
  tripId: string
  documentId: string
  documentName: string
}

export function DeleteDocumentButton({ tripId, documentId, documentName }: DeleteDocumentButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await deleteTravelDocument(tripId, documentId)
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={isPending}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{documentName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the document and its attachment. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
