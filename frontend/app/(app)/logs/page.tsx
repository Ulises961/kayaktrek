import Link from "next/link"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { listEndorsementRequests } from "@/lib/endorsement-requests/actions"
import { LogPageSchema, LogsSchema } from "@/lib/dtos/log"
import { LogsTabs } from "@/components/logs/logs-tabs"
import { EndorsementInbox } from "@/components/logs/endorsement-inbox"
import { Button } from "@/components/ui/button"
import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react"

export default async function LogsPage() {
  const [pageData, endorsedData, session, endorsementRequests] = await Promise.all([
    apiGet("/api/log/all?per_page=100")
      .then((r) => LogPageSchema.parse(r))
      .catch(() => ({ items: [], total: 0, page: 1, pages: 1 })),
    apiGet("/api/log/endorsed")
      .then((r) => LogsSchema.parse(r))
      .catch(() => []),
    getSession(),
    listEndorsementRequests("incoming"),
  ])

  const { items } = pageData

  const totalHours = items.reduce((sum, l) => sum + (l.hours ?? 0), 0)
  const totalDistance = items.reduce((sum, l) => sum + (l.distance ?? 0), 0)
  const seaItems = items.filter((l) => l.avgSea != null)
  const avgSea = seaItems.length
    ? seaItems.reduce((sum, l) => sum + l.avgSea!, 0) / seaItems.length
    : null

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Paddling logs</h1>
        <Button asChild size="sm">
          <Link href="/logs/new">Add log</Link>
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <ClockIcon className="size-3.5" /> Hours
            </span>
            <span className="text-xl font-semibold">{totalHours.toFixed(1)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <RouteIcon className="size-3.5" /> Distance
            </span>
            <span className="text-xl font-semibold">
              {totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <WavesIcon className="size-3.5" /> Avg sea
            </span>
            <span className="text-xl font-semibold">
              {avgSea != null ? `B${avgSea.toFixed(1)}` : "—"}
            </span>
          </div>
        </div>
      )}

      <EndorsementInbox requests={endorsementRequests} />

      <LogsTabs myLogs={items} endorsedLogs={endorsedData} currentUserId={session?.userId} />
    </div>
  )
}
