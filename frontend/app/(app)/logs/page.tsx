import { getSession } from "@/lib/auth/session"
import { getMe } from "@/lib/user/me"
import { listEndorsementRequests } from "@/lib/endorsement-requests/actions"
import { listMyLogs, listEndorsedLogs, getMyStats } from "@/lib/logs/actions"
import { modalSeaState } from "@/lib/logs/format"
import { beaufortLabel } from "@/lib/weather/beaufort"
import { DISTANCE_UNIT, toNm } from "@/lib/itinerary/distance"
import { LogsTabs } from "@/components/logs/logs-tabs"
import { PageHeading } from "@/components/common/page-heading"
import { EndorsementInbox } from "@/components/logs/endorsement-inbox"
import { AddLogDialog } from "@/components/logs/add-log-dialog"
import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react"

export default async function LogsPage() {
  const [mine, endorsed, stats, session, endorsementRequests, me] = await Promise.all([
    listMyLogs(),
    listEndorsedLogs(),
    getMyStats(),
    getSession(),
    listEndorsementRequests("incoming"),
    getMe(),
  ])

  const typicalSea = modalSeaState(stats.conditionsDistribution)
  const unit = me?.unitPreference ?? DISTANCE_UNIT.NM
  const displayDistance =
    unit === DISTANCE_UNIT.NM ? toNm(stats.totalDistance) : stats.totalDistance

  return (
    <>
      <div className="flex items-center justify-between">
        <PageHeading>Paddling logs</PageHeading>
        <AddLogDialog unit={unit} />
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
              {stats.totalDistance > 0 ? `${displayDistance.toFixed(1)} ${unit}` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
              <WavesIcon className="size-3.5" /> Typical sea
            </span>
            <span className="text-xl font-semibold">
              {typicalSea != null ? `B${typicalSea} · ${beaufortLabel(typicalSea)}` : "—"}
            </span>
          </div>
        </div>
      )}

      <EndorsementInbox requests={endorsementRequests} unit={unit} />

      <LogsTabs
        initialMine={mine}
        initialEndorsed={endorsed}
        currentUserId={session?.userId}
        unit={unit}
      />
    </>
  )
}
