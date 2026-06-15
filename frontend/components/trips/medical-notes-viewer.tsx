"use client"

import { Loader2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MedicalNotesViewerProps {
  hasLeaderMedicalNotes: boolean
  notes: string | null
  loading: boolean
  error: string | null
  onView: () => void
}

export function MedicalNotesViewer({
  hasLeaderMedicalNotes,
  notes,
  loading,
  error,
  onView,
}: MedicalNotesViewerProps) {
  if (!hasLeaderMedicalNotes) {
    return <p className="text-muted-foreground text-sm italic">No medical notes shared.</p>
  }

  if (notes) {
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded border p-3">
        <p className="text-destructive mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] uppercase">
          <ShieldAlert className="size-3" /> Medical Notes
        </p>
        <p className="text-sm whitespace-pre-wrap">{notes}</p>
        {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onView} disabled={loading}>
        {loading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
        View medical notes
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
