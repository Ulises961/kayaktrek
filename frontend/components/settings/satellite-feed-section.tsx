"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { SatelliteDishIcon, TrashIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SATELLITE_PROVIDER,
  SATELLITE_PROVIDER_LABELS,
  SatelliteFeedFormSchema,
  type SatelliteFeed,
  type SatelliteFeedFormValues,
} from "@/lib/dtos/satellite-feed"
import { deleteSatelliteFeed, saveSatelliteFeed } from "@/lib/satellite-feeds/actions"
import { formatTimeAgo } from "@/lib/utils/date"

interface SatelliteFeedSectionProps {
  feeds: SatelliteFeed[]
}

// M29 — the paddler's registered satellite communicator feed. A profile setting rather
// than a per-trip one: the poll task resolves whichever trips are HAPPENING at poll time.
//
// Garmin inReach only. The backend enum carries SPOT and Zoleo, but both are blocked on
// unresolved provider research (`docs/mobile/satellite-feed-spec.md` §3.5), so the form
// offers no provider choice at all — a select with one usable option and two that fail is
// worse than no select.
export function SatelliteFeedSection({ feeds }: SatelliteFeedSectionProps) {
  const [editing, setEditing] = useState<SatelliteFeed | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const open = adding || editing !== null

  function close() {
    setAdding(false)
    setEditing(null)
    setError(null)
  }

  function handleSave(values: SatelliteFeedFormValues) {
    setError(null)
    startTransition(async () => {
      const result = await saveSatelliteFeed(editing?.id ?? null, values)
      if (result.success) close()
      else setError(result.error)
    })
  }

  function handleDelete(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deleteSatelliteFeed(id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Share your inReach position with your crew automatically. Paste your MapShare feed URL and
        it is polled about every 10 minutes while a trip is under way. Your device&apos;s SOS button
        is unaffected — it goes straight to Garmin, never through this app.
      </p>

      {feeds.map((feed) => (
        <div key={feed.id} className="border-border flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <SatelliteDishIcon className="size-4 shrink-0" />
                <span className="text-sm font-medium">
                  {SATELLITE_PROVIDER_LABELS[feed.provider]}
                </span>
              </div>
              <span className="text-muted-foreground truncate text-xs">{feed.feedUrl}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(feed)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleDelete(feed.id)}
              >
                <TrashIcon className="size-4" />
                Remove
              </Button>
            </div>
          </div>

          {/* The poll task skips a needs_reauth feed entirely until the user re-saves,
              so without this a paddler believes they are being tracked while nothing is
              being ingested. Loud on purpose. */}
          {feed.needsReauth && (
            <p className="text-destructive text-sm">
              Sign-in failed — this feed is not being polled. Re-enter its password to start it
              again.
            </p>
          )}

          <p className="text-muted-foreground text-xs">
            {feed.lastPolledAt
              ? `Last checked ${formatTimeAgo(feed.lastPolledAt)}`
              : "Not polled yet"}
            {feed.lastIngestedAt && ` · last position ${formatTimeAgo(feed.lastIngestedAt)}`}
          </p>
        </div>
      ))}

      {open ? (
        <SatelliteFeedForm
          feed={editing}
          onSubmit={handleSave}
          onCancel={close}
          isPending={isPending}
          error={error}
        />
      ) : (
        <div className="flex flex-col items-start gap-2">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            {feeds.length === 0 ? "Add a feed" : "Add another feed"}
          </Button>
        </div>
      )}
    </div>
  )
}

function SatelliteFeedForm({
  feed,
  onSubmit,
  onCancel,
  isPending,
  error,
}: {
  feed: SatelliteFeed | null
  onSubmit: (values: SatelliteFeedFormValues) => void
  onCancel: () => void
  isPending: boolean
  error: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SatelliteFeedFormValues>({
    resolver: zodResolver(SatelliteFeedFormSchema),
    defaultValues: {
      provider: feed?.provider ?? SATELLITE_PROVIDER.INREACH_MAPSHARE,
      feedUrl: feed?.feedUrl ?? "",
      feedPassword: "",
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <input type="hidden" {...register("provider")} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedUrl">Feed URL</Label>
        <Input
          id="feedUrl"
          placeholder="https://share.garmin.com/feed/Share/yourname"
          {...register("feedUrl")}
        />
        <p className="text-muted-foreground text-xs">
          From your Garmin MapShare page. It must be public, or set the password below.
        </p>
        {errors.feedUrl && <p className="text-destructive text-sm">{errors.feedUrl.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedPassword">MapShare password (optional)</Label>
        <Input
          id="feedPassword"
          type="password"
          autoComplete="off"
          placeholder={feed ? "Unchanged" : ""}
          {...register("feedPassword")}
        />
        {/* Deliberately not prefilled, and blank means "leave as-is": the server never
            returns a stored password, so there is nothing truthful to prefill with. */}
        <p className="text-muted-foreground text-xs">
          Only if your MapShare page is password-protected. Leave blank to keep the current one.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save feed"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
