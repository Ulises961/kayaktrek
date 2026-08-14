import Link from "next/link"
import { RadioIcon, CalendarIcon, MapIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { SectionLabel } from "@/components/common/section-label"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { expeditionProgress } from "@/lib/trips/progress"
import { formatDateRange } from "@/lib/trips/format"
import { liveMapHref } from "@/lib/trips/live"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import type { RouteData } from "@/lib/itinerary/public-routes"

interface ActiveExpeditionCardProps {
  trip: Trip
  /** The trip's plotted passage, or null when it has no route yet. */
  route: RouteData | null
}

/**
 * The dashboard's panel for a trip that is currently `happening` — the design showcase's
 * "Live expedition panel" (`/design` §2), built.
 *
 * Everything it shows comes from the trip envelope the dashboard already fetched: the
 * trips response nests each itinerary's days with their weather and sea rows, and the
 * traveller list. No extra requests, for the same reason the route thumbnails derive
 * theirs from data in hand rather than re-fetching per card.
 *
 * Every block below the title is independently optional. A trip mid-paddle with no dates,
 * no forecast and no crew still renders as a card rather than collapsing — this is the
 * surface a paddler opens *during* an expedition, so it degrades instead of disappearing.
 */
export function ActiveExpeditionCard({ trip, route }: ActiveExpeditionCardProps) {
  const progress = expeditionProgress(trip.dateFrom, trip.dateTo)
  const conditions = currentConditions(trip)
  const crew = trip.travellers ?? []
  const liveHref = liveMapHref(trip)

  return (
    // `pt-0` + `overflow-hidden` so the chart sits flush to the card's top edge, the way
    // it does on the plan cards — the panel is a richer card, not a different object.
    <Card className="gap-0 overflow-hidden pt-0">
      {/* The passage stays on the card. Losing it when a trip goes `happening` would
          take the map away exactly when the paddler is on it. Its own link, rather than
          wrapping the whole card, because the card carries a button of its own and
          anchors cannot nest. */}
      {route && (
        <Link href={`/trips/${trip.id}`} className="block">
          <RouteThumbnail route={route} />
        </Link>
      )}
      <CardHeader className={route ? "pt-5 pb-3" : "pt-6 pb-3"}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <SectionLabel as="p" className="mb-1">
              Active expedition
            </SectionLabel>
            <CardTitle className="truncate text-lg tracking-[-0.01em]">
              <Link href={`/trips/${trip.id}`} className="hover:underline">
                {trip.destination ?? "Untitled trip"}
              </Link>
            </CardTitle>
            {/* The planned dates, as on the plan cards. "Day 3 of 5" says where you are
                in the trip; it does not say when the trip is. */}
            {trip.dateFrom && (
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm">
                <CalendarIcon className="size-3 shrink-0" />
                {formatDateRange(trip.dateFrom, trip.dateTo)}
              </p>
            )}
          </div>
          {trip.state && <StateBadge state={trip.state} />}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Same affordance the plan cards carry: a trip can be under way with an
            itinerary that has no plotted points yet, and the card should say so rather
            than just showing no chart. */}
        {!route && trip.itinerary?.id && (
          <Link
            href={`/trips/${trip.id}`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <MapIcon className="size-3 shrink-0" />
            Itinerary ready — open to view the route
          </Link>
        )}

        {progress && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Day {progress.dayNumber} of {progress.totalDays}
              </span>
              <span className="text-muted-foreground font-mono text-xs">{progress.percent}%</span>
            </div>
            {/* Foam is the live/motion signal colour (`/design` §6) — the one place the
                app says "this is happening now" rather than "this exists". */}
            <div
              className="bg-border h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Day ${progress.dayNumber} of ${progress.totalDays}`}
            >
              <div
                className="bg-foam h-full rounded-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {conditions.length > 0 && (
          // Single column at base: two columns of a 320px viewport leaves ~120px per
          // cell, which wraps "12 kn NW" onto two lines (M18's breakpoint contract).
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {conditions.map((condition) => (
              <div
                key={condition.label}
                className="bg-surface-3 flex flex-col gap-0.5 rounded-md p-3"
              >
                <SectionLabel as="span">{condition.label}</SectionLabel>
                <p className="font-mono text-sm font-medium">{condition.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {crew.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {crew.slice(0, 4).map((member) => (
                  <UserAvatar
                    key={member.id ?? member.user.id}
                    name={member.user.name}
                    surname={member.user.surname}
                    size="sm"
                    className="ring-background ring-2"
                  />
                ))}
              </div>
              <span className="text-muted-foreground text-sm">
                {crew.length} {crew.length === 1 ? "paddler" : "crew"}
              </span>
            </div>
          )}
          {/* Straight to the live map — the itinerary deep-linked into Navigate mode,
              which is where position sharing actually happens (M8). Same href the trip's
              own Live tab uses, via the shared helper. Absent when there is no itinerary
              to navigate, since a dead button is worse than none. */}
          {liveHref && (
            <Button asChild size="sm" className="bg-foam hover:bg-foam/90 gap-1.5 text-white">
              <Link href={liveHref}>
                <RadioIcon className="size-3.5" />
                Live tracking
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface Condition {
  label: string
  value: string
}

/**
 * Wind, swell and next stop for the day the expedition is on.
 *
 * Only conditions that actually have data are returned, so a trip with no forecast shows
 * no grid at all rather than a row of dashes. Weather is hourly (`weatherStates`); the
 * first entry stands for the day, which is what the day-level summary elsewhere uses.
 */
function currentConditions(trip: Trip): Condition[] {
  if (trip.state !== TRIP_STATE.HAPPENING) return []

  const day = dayInProgress(trip)
  if (!day) return []

  const conditions: Condition[] = []

  const hour = day.weather?.weatherStates?.[0]
  if (hour?.windForce != null) {
    conditions.push({
      label: "Wind",
      value: `${Math.round(hour.windForce)} kn${hour.windDirection != null ? ` ${compassPoint(hour.windDirection)}` : ""}`,
    })
  }

  // `sea` is the day's tidal record; the wave/swell figures live in its hourly
  // `seaStates`, mirroring weather's `weatherStates`.
  const seaState = day.sea?.seaStates?.[0]
  if (seaState?.swellWaveHeight != null) {
    conditions.push({
      label: "Swell",
      value: `${seaState.swellWaveHeight.toFixed(1)} m${seaState.swellPeriod != null ? ` · ${Math.round(seaState.swellPeriod)} s` : ""}`,
    })
  }

  const nextStop = day.points?.find((point) => point.name)?.name
  if (nextStop) conditions.push({ label: "Next stop", value: nextStop })

  return conditions
}

/**
 * The itinerary day the expedition is on right now.
 *
 * Matched on the day's own `date` rather than by counting from the start, because the two
 * can disagree: a `happening` trip can run past its planned end, or start before it, and
 * an itinerary need not have one day per calendar day. Falling back to the progress index
 * keeps something sensible on the older trips whose days carry no date.
 */
function dayInProgress(trip: Trip) {
  const days = trip.itinerary?.days ?? []
  if (days.length === 0) return undefined

  const today = localCalendarDate()
  const dated = days.find((day) => day.date === today)
  if (dated) return dated

  const progress = expeditionProgress(trip.dateFrom, trip.dateTo)
  return progress ? days[Math.min(progress.dayNumber, days.length) - 1] : undefined
}

/** Today in the viewer's timezone, as `YYYY-MM-DD` — the form `Day.date` is stored in. */
function localCalendarDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

/** Degrees to an eight-point compass label — "12 kn NW" reads faster than "12 kn 315°". */
function compassPoint(degrees: number): string {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]
}
