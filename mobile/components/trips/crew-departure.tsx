import { useState } from "react"

import { formatDayDate } from "@shared/utils/date"

import { MUTATION_ENTITY, MUTATION_OPERATION, enqueueMutation, pushQueuedMutations } from "../../lib/db/mutation-queue"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

type DepartureMember = {
  id?: string | null
  leftAt?: string | null
  leftNote?: string | null
  departureUnsent: boolean
}

// M9d WP5: under a crew row, whether the paddler has left a trip under way, and
// for the leader the way to record it — injury, evacuation, picked up by the
// support boat — with or without signal. Queued like every offline change and
// sent at once when there is signal; the float plan and shore contact then know
// who is still on the water.
export function CrewDeparture({
  tripId,
  member,
  name,
  canRecord,
}: {
  tripId: string
  member: DepartureMember
  name: string
  // Leader, trip under way, and not the leader's own row.
  canRecord: boolean
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const memberId = member.id
  if (!memberId) return null

  async function queue(operation: "create" | "delete", payload: Record<string, unknown>) {
    setBusy(true)
    try {
      await enqueueMutation({
        entityType: MUTATION_ENTITY.CREW_DEPARTURE,
        operation: operation === "create" ? MUTATION_OPERATION.CREATE : MUTATION_OPERATION.DELETE,
        entityId: memberId as string,
        payload: { tripId, ...payload },
      })
      // Best effort: offline it fails, and the next sweep sends it.
      void pushQueuedMutations().catch(() => undefined)
      setOpen(false)
      setNote("")
    } finally {
      setBusy(false)
    }
  }

  if (member.leftAt) {
    return (
      <Stack className="gap-1 pt-2">
        <Text className="text-xs font-medium text-sunset-600">
          {`Left the trip ${formatDayDate(member.leftAt)}${member.departureUnsent ? " (recorded here, not sent yet)" : ""}`}
        </Text>
        {member.leftNote && <Text className="text-xs text-muted-foreground">{member.leftNote}</Text>}
        {canRecord && (
          <Button
            variant="link"
            size="sm"
            className="self-start px-0"
            disabled={busy}
            onPress={() => void queue("delete", {})}
            testID={`departure-undo-${memberId}`}
          >
            Undo
          </Button>
        )}
      </Stack>
    )
  }

  if (!canRecord) return null

  if (!open) {
    return (
      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        onPress={() => setOpen(true)}
        accessibilityLabel={`${name} left the trip`}
        testID={`departure-open-${memberId}`}
      >
        Left the trip
      </Button>
    )
  }

  return (
    <Stack className="gap-2 pt-2">
      <Input
        value={note}
        onChangeText={setNote}
        placeholder="Why and where (optional)"
        testID={`departure-note-${memberId}`}
      />
      <Row className="gap-2">
        <Button
          size="sm"
          disabled={busy}
          onPress={() => void queue("create", note.trim() ? { note: note.trim() } : {})}
          testID={`departure-record-${memberId}`}
        >
          Record
        </Button>
        <Button size="sm" variant="outline" onPress={() => setOpen(false)}>
          Cancel
        </Button>
      </Row>
    </Stack>
  )
}
