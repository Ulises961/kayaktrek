import Link from "next/link"
import { apiGet } from "@/lib/api/client"
import { LogPageSchema } from "@/lib/dtos/log"
import { LogCard } from "@/components/logs/log-card"
import { Button } from "@/components/ui/button"
import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react"

export default async function LogsPage() {
  let data
  try {
    const raw = await apiGet("/api/log/all?per_page=100")
    data = LogPageSchema.parse(raw)
  } catch {
    data = { items: [], total: 0, page: 1, pages: 1 }
  }

  const { items } = data

  const totalHours = items.reduce((sum, l) => sum + (l.hours ?? 0), 0)
  const totalDistance = items.reduce((sum, l) => sum + (l.distance ?? 0), 0)
  const seaItems = items.filter((l) => l.avgSea != null)
  const avgSea = seaItems.length
    ? seaItems.reduce((sum, l) => sum + l.avgSea!, 0) / seaItems.length
    : null

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Paddling logs</h1>
        <Button asChild size="sm">
          <Link href="/logs/new">Add log</Link>
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ClockIcon className="size-3.5" /> Hours
            </span>
            <span className="text-xl font-semibold">{totalHours.toFixed(1)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <RouteIcon className="size-3.5" /> Distance
            </span>
            <span className="text-xl font-semibold">
              {totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border p-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <WavesIcon className="size-3.5" /> Avg sea
            </span>
            <span className="text-xl font-semibold">
              {avgSea != null ? `B${avgSea.toFixed(1)}` : "—"}
            </span>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No logs yet. Record your first session.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((log) => (
            <LogCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}
