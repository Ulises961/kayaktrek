import type { PaddlerSearchResult } from "@shared/dtos/paddler-search"

import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// One button, driven entirely by the backend's relationship annotation (M7b) — no
// client-side derivation of connection state, since the search endpoint is already
// block-filtered and self-excluding and carries the connection id needed to act.
export function PaddlerResultCard({
  paddler,
  busy,
  onConnect,
  onCancel,
}: {
  paddler: PaddlerSearchResult
  busy: boolean
  onConnect: () => void
  onCancel: () => void
}) {
  return (
    <Card>
      <CardContent>
        <Row className="justify-between">
          <Stack className="gap-0.5">
            <Text className="font-medium">
              {paddler.name} {paddler.surname ?? ""}
            </Text>
            <Text className="text-sm text-muted-foreground">@{paddler.username}</Text>
          </Stack>
          {paddler.relationship === "none" && (
            <Button size="sm" disabled={busy} onPress={onConnect}>
              Connect
            </Button>
          )}
          {paddler.relationship === "pending_outgoing" && (
            <Button size="sm" variant="outline" disabled={busy} onPress={onCancel}>
              Requested
            </Button>
          )}
          {paddler.relationship === "pending_incoming" && (
            <Text className="text-sm text-muted-foreground">Awaiting your reply</Text>
          )}
          {paddler.relationship === "buddy" && (
            <Text className="text-sm text-muted-foreground">Buddies</Text>
          )}
        </Row>
      </CardContent>
    </Card>
  )
}
