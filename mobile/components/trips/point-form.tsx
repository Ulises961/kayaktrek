import { useState, type ReactNode } from "react"

import { POINT_TYPE, type PointType } from "@shared/dtos/point"

import { Button } from "../ui/button"
import { Chip } from "../ui/chip"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

export type PointFormValues = {
  name: string
  notes: string
  type: PointType
  dayId: string
}

export type DayOption = { id: string; dayNumber: number }

// Shared by the add and edit point screens (M9d WP3), like LogForm for logs:
// plain controlled inputs, converted to the route's fields only on submit.
export function PointForm({
  initial,
  days,
  submitLabel,
  submitting,
  error,
  onSubmit,
  children,
}: {
  initial: PointFormValues
  days: DayOption[]
  submitLabel: string
  submitting: boolean
  error: string | null
  onSubmit: (values: PointFormValues) => void
  // Screen-specific controls between the fields and the submit button.
  children?: ReactNode
}) {
  const [name, setName] = useState(initial.name)
  const [notes, setNotes] = useState(initial.notes)
  const [type, setType] = useState<PointType>(initial.type)
  const [dayId, setDayId] = useState(initial.dayId)

  return (
    <Stack className="gap-4">
      <Stack className="gap-1">
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} placeholder="Unnamed" testID="point-name" />
      </Stack>

      <Stack className="gap-2">
        <Label>Type</Label>
        <Row className="gap-2">
          <Chip
            active={type === POINT_TYPE.STOP}
            onPress={() => setType(POINT_TYPE.STOP)}
            testID="point-type-stop"
          >
            Stop
          </Chip>
          <Chip
            active={type === POINT_TYPE.POSITION}
            onPress={() => setType(POINT_TYPE.POSITION)}
            testID="point-type-position"
          >
            Waypoint
          </Chip>
        </Row>
      </Stack>

      <Stack className="gap-2">
        <Label>Day</Label>
        <Row className="flex-wrap gap-2">
          {days.map((day) => (
            <Chip
              key={day.id}
              active={dayId === day.id}
              onPress={() => setDayId(day.id)}
              testID={`point-day-${day.dayNumber}`}
            >
              {`Day ${day.dayNumber}`}
            </Chip>
          ))}
        </Row>
      </Stack>

      <Stack className="gap-1">
        <Label>Notes</Label>
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Landing, water, hazards"
          multiline
          numberOfLines={3}
          testID="point-notes"
        />
      </Stack>

      {children}

      {error && <Text className="text-sm text-destructive">{error}</Text>}
      <Button
        onPress={() => onSubmit({ name, notes, type, dayId })}
        disabled={submitting}
        testID="point-submit"
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </Stack>
  )
}
