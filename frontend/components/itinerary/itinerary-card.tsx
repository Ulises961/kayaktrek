"use client"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DownloadIcon, GlobeIcon, LockIcon } from "lucide-react"
import { updateItinerary } from "@/lib/itinerary/actions"
import type { Itinerary } from "@/lib/dtos/itinerary"

export type ItineraryCardProps = {
  itinerary: Itinerary
}

export function ItineraryCard({ itinerary }: ItineraryCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const numberedDays = (itinerary.days ?? []).filter((d) => d.dayNumber > 0)

  function handleTogglePublic(e: React.MouseEvent) {
    e.preventDefault()
    startTransition(async () => {
      await updateItinerary(itinerary.id ?? "", { isPublic: !itinerary.isPublic })
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border bg-card hover:bg-accent transition-colors">
      <Link href={`/itinerary/${itinerary.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium truncate">
            {itinerary.name || "Unnamed itinerary"}
          </h2>
          {itinerary.isPublic && (
            <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-300">
              Public
            </span>
          )}
        </div>
        <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
          {numberedDays.length > 0 && (
            <span>{numberedDays.length} {numberedDays.length === 1 ? "day" : "days"}</span>
          )}
          {itinerary.totalMiles != null && itinerary.totalMiles > 0 && (
            <span>{itinerary.totalMiles.toFixed(1)} nm</span>
          )}
        </div>
      </Link>
      <div className="flex items-center gap-3 px-4 pb-3 pt-1 border-t border-border/50">
        <button
          onClick={handleTogglePublic}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
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
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <DownloadIcon className="size-3" />
          <span>GPX</span>
        </a>
      </div>
    </div>
  )
}
