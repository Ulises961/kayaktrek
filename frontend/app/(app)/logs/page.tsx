import Link from "next/link"
import { getSession } from "@/lib/auth/session"
import { listEndorsementRequests } from "@/lib/endorsement-requests/actions"
import { listMyLogs, listEndorsedLogs, getMyStats } from "@/lib/logs/actions"
import { averageSeaState } from "@/lib/logs/format"
import { LogsTabs } from "@/components/logs/logs-tabs"
import { EndorsementInbox } from "@/components/logs/endorsement-inbox"
import { Button } from "@/components/ui/button"
import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react"

export default async function LogsPage() {
  const [mine, endorsed, stats, session, endorsementRequests] = await Promise.all([
    listMyLogs(),
    listEndorsedLogs(),
    getMyStats(),
    getSession(),
    listEndorsementRequests("incoming"),
  ])

  const avgSea = averageSeaState(stats.conditionsDistribution)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Paddling logs</h1>
        <Button asChild size="sm">
          <Link href="/logs/new">Add log</Link>
        </Button>
      </div>

      {stats.logCount > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <ClockIcon className="size-3.5" /> Hours
            </span>
            <span className="text-xl font-semibold">{stats.totalHours.toFixed(1)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <RouteIcon className="size-3.5" /> Distance
            </span>
            <span className="text-xl font-semibold">
              {stats.totalDistance > 0 ? `${stats.totalDistance.toFixed(1)} km` : "—"}
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

      <LogsTabs initialMine={mine} initialEndorsed={endorsed} currentUserId={session?.userId} />
    </div>
  )
}
