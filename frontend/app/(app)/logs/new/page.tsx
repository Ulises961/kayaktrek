import { LogForm } from "@/components/logs/log-form"
import { getMe } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

export default async function NewLogPage() {
  const me = await getMe()
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Add paddling log</h1>
      <LogForm unit={me?.unitPreference ?? DISTANCE_UNIT.NM} />
    </div>
  )
}
