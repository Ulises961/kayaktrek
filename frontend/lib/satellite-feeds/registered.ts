import "server-only"
import { cache } from "react"
import { listSatelliteFeeds } from "@/lib/satellite-feeds/actions"

// Whether the signed-in user has registered a satellite feed. Wrapped in React `cache()` so
// the trip layout (which warns when a registered feed is not sharing) and the Float plan page
// (which offers the switch) share ONE upstream call per request, as `getTripCore` does.
export const hasRegisteredFeed = cache(async (): Promise<boolean> => {
  return (await listSatelliteFeeds()).length > 0
})
