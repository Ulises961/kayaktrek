import { ChevronLeftIcon, EllipsisIcon } from "lucide-react-native"
import type { ReactNode } from "react"
import { Pressable } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import { palette } from "@shared/tokens"
import { daysBetween, formatDateRange, tripDayLabel } from "@shared/trips/format"

import { pendingTripChanges } from "../../lib/trips/pending-trip-changes"
import { describeChange, useQueuedChanges } from "../../lib/network/queued-changes"
import type { TripHeaderView } from "../../lib/trips/use-trip-header"
import { Row, Stack } from "../ui/layout"
import { StateBadge } from "../ui/state-badge"
import { Text } from "../ui/text"

type TripHeaderProps = {
  tripId: string
  trip: TripHeaderView
  /** Today's ISO date, passed in so the label is the same wherever it is rendered. */
  today: string
  /** Title row only: the itinerary tab hands the rest of the height to its map. */
  compact: boolean
  onBack: () => void
  /** `null` when there is nothing to do to the trip, which hides the button. */
  onOpenActions: (() => void) | null
  /** A control the tab in front wants beside •••, such as the itinerary's Edit button. */
  trailing?: ReactNode
}

// Who the trip is and where it stands, over every tab (M43). Everything that can be done to
// the trip sits behind the ••• button, so the tabs start right under this block — the same
// split web's trip page makes (M40).
export function TripHeader({
  tripId,
  trip,
  today,
  compact,
  onBack,
  onOpenActions,
  trailing,
}: TripHeaderProps) {
  const { pending } = useQueuedChanges()
  const unsent = pendingTripChanges(tripId, pending)

  const days = trip.dateFrom && trip.dateTo ? daysBetween(trip.dateFrom, trip.dateTo) : null
  const dayLabel = tripDayLabel(trip, today)

  return (
    <Stack className="gap-1 border-b border-border bg-background px-2 pb-2">
      <Row className="items-center gap-1">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to trips"
          hitSlop={8}
          className="h-11 w-9 items-center justify-center"
          testID="trip-back"
        >
          <ChevronLeftIcon size={22} color={palette.ocean700} />
        </Pressable>
        <Text className="shrink text-lg font-semibold" numberOfLines={1}>
          {trip.destination ?? "Untitled trip"}
        </Text>
        {trip.state && <StateBadge state={trip.state} className="shrink-0" />}
        {!compact && trip.difficulty && (
          <Text className="shrink-0 rounded-[3px] border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {DIFFICULTY_LABELS[trip.difficulty]}
          </Text>
        )}
        <Row className="flex-1 items-center justify-end">
          {trailing}
          {onOpenActions && (
            <Pressable
              onPress={onOpenActions}
              accessibilityRole="button"
              accessibilityLabel="Trip actions"
              hitSlop={8}
              className="h-11 w-11 items-center justify-center"
              testID="trip-actions"
            >
              <EllipsisIcon size={22} color={palette.ocean700} />
            </Pressable>
          )}
        </Row>
      </Row>

      {!compact && (
        <Row className="flex-wrap items-center gap-x-1.5 px-2">
          <Text className="text-sm text-muted-foreground">
            {formatDateRange(trip.dateFrom, trip.dateTo)}
          </Text>
          {dayLabel ? (
            <Text className="text-xs font-medium">{dayLabel}</Text>
          ) : (
            days !== null && <Text className="text-xs text-muted-foreground">{`(${days} days)`}</Text>
          )}
        </Row>
      )}

      {/* A safety message, so it stays on every tab rather than behind the actions: until the
          server has the change it still expects the old plan, and the shore contact's
          missed-checkpoint alert runs off that plan. */}
      {unsent.length > 0 && (
        <Stack className="mx-2 gap-0.5 rounded-lg bg-sunset-100 p-2" testID="trip-unsent-banner">
          <Text className="text-xs font-medium text-sunset-600">
            {`Not sent yet: ${unsent.map(describeChange).join(", ")}.`}
          </Text>
          <Text className="text-xs text-sunset-600">
            A missed checkpoint can still alert your shore contact until it is sent.
          </Text>
        </Stack>
      )}
    </Stack>
  )
}
