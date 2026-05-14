"use client"

import { useState } from "react"
import { DownloadIcon, ExternalLinkIcon, PaperclipIcon, PencilIcon, ReceiptIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddDocumentDialog } from "./add-document-dialog"
import { EditDocumentDialog } from "./edit-document-dialog"
import { DeleteDocumentButton } from "./delete-document-button"
import { getTravelDocumentAttachmentUrl } from "@/lib/travel-documents/actions"
import { TRAVEL_DOCUMENT_TYPES, type TravelDocument, type TravelDocumentType } from "@/lib/dtos/travel-document"

interface TravelDocumentsSectionProps {
  documents: TravelDocument[]
  today: string
  tripId?: string
  currentUserId?: string
  leaderId?: string
  isMember?: boolean
}

// ── Type metadata ────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<TravelDocumentType, string> = {
  accommodation: "Accommodation",
  transport:     "Transport",
  insurance:     "Insurance",
  permit:        "Permit",
  other:         "Other",
}

const TYPE_STYLE: Record<TravelDocumentType, { bar: string; label: string }> = {
  accommodation: { bar: "bg-[#2aa8a0]",           label: "text-[#2aa8a0] dark:text-[#4bbdb5]"  },
  transport:     { bar: "bg-[#2272b6]",           label: "text-[#2272b6] dark:text-[#4fa8d4]"  },
  insurance:     { bar: "bg-[#d97706]",           label: "text-[#d97706] dark:text-[#f59e0b]"  },
  permit:        { bar: "bg-emerald-600",         label: "text-emerald-600 dark:text-emerald-400" },
  other:         { bar: "bg-muted-foreground/40", label: "text-muted-foreground"                },
}

// ── Date status ──────────────────────────────────────────────────────────────

type DocStatus = "overdue" | "expiring-soon" | null

function getDocStatus(doc: TravelDocument, today: string): DocStatus {
  if (doc.date && doc.date < today) return "overdue"
  if (doc.expiryDate) {
    if (doc.expiryDate < today) return "overdue"
    const days = Math.ceil(
      (new Date(doc.expiryDate).getTime() - new Date(today).getTime()) / 86_400_000
    )
    if (days <= 30) return "expiring-soon"
  }
  return null
}

function StatusBadge({ status, expiryDate }: { status: DocStatus; expiryDate?: string | null }) {
  if (!status) return null
  if (status === "overdue") {
    return (
      <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-destructive/10 text-destructive">
        Overdue
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#fef3c7] text-[#d97706] dark:bg-[#d97706]/20 dark:text-[#f59e0b]">
      Expires {expiryDate}
    </span>
  )
}

// ── Attachment download link ─────────────────────────────────────────────────

function AttachmentDownload({ documentId }: { documentId: string }) {
  async function handleDownload() {
    const result = await getTravelDocumentAttachmentUrl(documentId)
    if (result.success) window.open(result.url, "_blank")
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <PaperclipIcon className="size-3" />
      <DownloadIcon className="size-3" />
      Download
    </button>
  )
}

// ── Document row ─────────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: TravelDocument
  today: string
  canEdit: boolean
  onEdit: () => void
  tripId: string
}

function DocumentRow({ doc, today, canEdit, onEdit, tripId }: DocumentRowProps) {
  const style  = TYPE_STYLE[doc.type]
  const status = getDocStatus(doc, today)

  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className={`w-0.5 rounded-full shrink-0 self-stretch ${style.bar}`} />

      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium leading-tight">{doc.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${style.label}`}>
              {TYPE_LABEL[doc.type]}
            </span>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={onEdit}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                {tripId && doc.id && (
                  <DeleteDocumentButton tripId={tripId} documentId={doc.id} documentName={doc.name} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {doc.date && <span className="text-xs text-muted-foreground">{doc.date}</span>}
          {doc.expiryDate && !doc.date && <span className="text-xs text-muted-foreground">until {doc.expiryDate}</span>}
          {status && <StatusBadge status={status} expiryDate={doc.expiryDate} />}
          {doc.confirmationNumber && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <ReceiptIcon className="size-3" />
              {doc.confirmationNumber}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLinkIcon className="size-3" />
              Open booking
            </a>
          )}
          {doc.attachmentPath && doc.id && (
            <AttachmentDownload documentId={doc.id} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function TravelDocumentsSection({ documents, today, tripId, currentUserId, leaderId, isMember }: TravelDocumentsSectionProps) {
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const editingDoc = documents.find((d) => d.id === editingDocId) ?? null

  function canEdit(doc: TravelDocument) {
    if (!currentUserId || !tripId) return false
    return doc.ownerId === currentUserId || currentUserId === leaderId
  }

  return (
    <>
      <div className="flex flex-col gap-0">
        {isMember && tripId && (
          <div className="flex justify-end mb-3">
            <AddDocumentDialog tripId={tripId} />
          </div>
        )}
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No travel documents added yet — bookings, permits, and insurance go here.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {TRAVEL_DOCUMENT_TYPES.filter((t) => documents.some((d) => d.type === t)).map((type) => (
              <div key={type} className="py-2.5 first:pt-0 last:pb-0">
                {documents.filter((d) => d.type === type).map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    today={today}
                    canEdit={canEdit(doc)}
                    onEdit={() => setEditingDocId(doc.id ?? null)}
                    tripId={tripId ?? ""}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {editingDoc && tripId && (
        <EditDocumentDialog
          tripId={tripId}
          document={editingDoc}
          open={!!editingDocId}
          onOpenChange={(o) => { if (!o) setEditingDocId(null) }}
        />
      )}
    </>
  )
}
