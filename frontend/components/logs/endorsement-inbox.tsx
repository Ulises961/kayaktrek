"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheckIcon, XIcon } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { endorseLog } from "@/lib/logs/actions"
import { deleteEndorsementRequest } from "@/lib/endorsement-requests/actions"
import { formatDayDate } from "@/lib/utils/date"
import { DISTANCE_UNIT, toNm, type DistanceUnit } from "@/lib/itinerary/distance"
import type { EndorsementRequest } from "@/lib/dtos/endorsement-request"

interface EndorsementInboxProps {
  requests: EndorsementRequest[]
  unit?: DistanceUnit
}

// The "asked to endorse" prompt: trip-mates who asked the viewer to endorse a log.
// Endorsing resolves the request server-side (the existing endorse endpoint);
// declining deletes it.
export function EndorsementInbox({ requests, unit = DISTANCE_UNIT.KM }: EndorsementInboxProps) {
  if (requests.length === 0) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BadgeCheckIcon className="size-4" />
          Asked to endorse ({requests.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <InboxRow key={request.id} request={request} unit={unit} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function InboxRow({ request, unit }: { request: EndorsementRequest; unit: DistanceUnit }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const author = request.requester
  const authorName = [author.name, author.surname].filter(Boolean).join(" ")
  const { date, distance, hours } = request.log
  const displayDistance = distance != null && unit === DISTANCE_UNIT.NM ? toNm(distance) : distance
  const detail = [
    date ? formatDayDate(date) : null,
    displayDistance != null ? `${displayDistance.toFixed(1)} ${unit}` : null,
    hours != null ? `${hours}h` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error ?? "Something went wrong.")
      else router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <UserAvatar
        name={author.name}
        surname={author.surname}
        imageUrl={author.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <span className="font-medium">{authorName}</span> asked you to endorse a paddle
        </p>
        {detail && <p className="text-muted-foreground truncate text-xs">{detail}</p>}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" disabled={pending} onClick={() => run(() => endorseLog(request.log.id))}>
          <BadgeCheckIcon className="size-4" /> Endorse
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => deleteEndorsementRequest(request.id!))}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Decline</span>
        </Button>
      </div>
    </li>
  )
}
