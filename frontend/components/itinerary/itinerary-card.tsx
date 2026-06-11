"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DownloadIcon, GlobeIcon, LockIcon, PlusIcon } from "lucide-react"
import { updateItinerary, createTripFromItinerary } from "@/lib/itinerary/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import type { Itinerary } from "@/lib/dtos/itinerary"

export type ItineraryCardProps = {
  itinerary: Itinerary
}

export function ItineraryCard({ itinerary }: ItineraryCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isCreatingTrip, startCreateTransition] = useTransition()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [tripName, setTripName] = useState("")

  const numberedDays = (itinerary.days ?? []).filter((d) => d.dayNumber > 0)

  function handleTogglePublic(e: React.MouseEvent) {
    e.preventDefault()
    startTransition(async () => {
      await updateItinerary(itinerary.id ?? "", { isPublic: !itinerary.isPublic })
      router.refresh()
    })
  }

  function handleOpenCreateDialog(e: React.MouseEvent) {
    e.preventDefault()
    setTripName(itinerary.name ?? "")
    setShowCreateDialog(true)
  }

  function handleCreateTrip() {
    const trimmed = tripName.trim()
    if (!trimmed) return
    startCreateTransition(async () => {
      const result = await createTripFromItinerary(itinerary.id ?? "", trimmed)
      if (result.success) {
        setShowCreateDialog(false)
        router.push(`/trips/${result.tripId}`)
      }
    })
  }

  return (
    <>
      <div className="bg-card hover:bg-accent rounded-lg border transition-colors">
        <Link href={`/itinerary/${itinerary.id}`} className="block p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate font-medium">{itinerary.name || "Unnamed itinerary"}</h2>
            {itinerary.isPublic && (
              <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                Public
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-2 flex gap-4 text-sm">
            {numberedDays.length > 0 && (
              <span>
                {numberedDays.length} {numberedDays.length === 1 ? "day" : "days"}
              </span>
            )}
            {itinerary.totalMiles != null && itinerary.totalMiles > 0 && (
              <span>{itinerary.totalMiles.toFixed(1)} nm</span>
            )}
          </div>
        </Link>
        <div className="border-border/50 flex flex-wrap items-center gap-3 border-t px-4 pt-1 pb-3">
          <button
            onClick={handleTogglePublic}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
          >
            {itinerary.isPublic ? (
              <>
                <LockIcon className="size-3" />
                <span>Make private</span>
              </>
            ) : (
              <>
                <GlobeIcon className="size-3" />
                <span>Make public</span>
              </>
            )}
          </button>
          <span className="text-border select-none">·</span>
          <a
            href={`/itinerary/${itinerary.id}/export`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
          >
            <DownloadIcon className="size-3" />
            <span>GPX</span>
          </a>
          {!itinerary.tripId && (
            <>
              <span className="text-border select-none">·</span>
              <button
                onClick={handleOpenCreateDialog}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
              >
                <PlusIcon className="size-3" />
                <span>Create trip</span>
              </button>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={showCreateDialog}
        onOpenChange={(v) => {
          setShowCreateDialog(v)
          if (!v) setTripName("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a trip</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Trip destination"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTrip()}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreatingTrip}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTrip} disabled={isCreatingTrip || !tripName.trim()}>
              {isCreatingTrip ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
