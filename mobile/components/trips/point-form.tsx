import { Anchor, CircleDot } from "lucide-react-native"
import { useState } from "react"

import { POINT_TYPE, type PointType } from "@shared/dtos/point"
import { lightTokens } from "@shared/tokens"

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
}

// Plain controlled inputs, converted to the route's fields only on submit.
export function PointForm({
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: {
  initial: PointFormValues
  submitLabel: string
  submitting: boolean
  error: string | null
  onSubmit: (values: PointFormValues) => void
}) {
  const [name, setName] = useState(initial.name)
  const [notes, setNotes] = useState(initial.notes)
  const [type, setType] = useState<PointType>(initial.type)

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
            <Row className="items-center gap-1.5">
              <Anchor
                size={14}
                color={type === POINT_TYPE.STOP ? lightTokens.primaryForeground : lightTokens.foreground}
              />
              <Text className={type === POINT_TYPE.STOP ? "text-sm text-primary-foreground" : "text-sm text-foreground"}>
                Stop
              </Text>
            </Row>
          </Chip>
          <Chip
            active={type === POINT_TYPE.POSITION}
            onPress={() => setType(POINT_TYPE.POSITION)}
            testID="point-type-position"
          >
            <Row className="items-center gap-1.5">
              <CircleDot
                size={14}
                color={type === POINT_TYPE.POSITION ? lightTokens.primaryForeground : lightTokens.foreground}
              />
              <Text className={type === POINT_TYPE.POSITION ? "text-sm text-primary-foreground" : "text-sm text-foreground"}>
                Position
              </Text>
            </Row>
          </Chip>
        </Row>
      </Stack>

      <Stack className="gap-1">
        <Label>Notes</Label>
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Landing, water, hazards"
          multiline
          numberOfLines={6}
          className="min-h-32 max-h-40"
          testID="point-notes"
        />
      </Stack>

      {error && <Text className="text-sm text-destructive">{error}</Text>}
      <Button
        onPress={() => onSubmit({ name, notes, type })}
        disabled={submitting}
        testID="point-submit"
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </Stack>
  )
}
