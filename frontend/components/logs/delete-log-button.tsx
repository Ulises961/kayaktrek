"use client"

import { useTransition } from "react"
import { deleteLog } from "@/lib/logs/actions"
import { Button } from "@/components/ui/button"

interface DeleteLogButtonProps {
  logId: string
}

export function DeleteLogButton({ logId }: DeleteLogButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm("Delete this log? This cannot be undone.")) return
    startTransition(async () => {
      await deleteLog(logId)
    })
  }

  return (
    <Button variant="destructive" size="sm" disabled={isPending} onClick={handleClick}>
      {isPending ? "Deleting…" : "Delete log"}
    </Button>
  )
}
