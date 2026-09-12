import type { ConnectionUser } from "@shared/dtos/connection"

import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// Mirrors ConnectionRow/PaddlerResultCard's shape (M9k) — the Blocked tab used to
// render this inline as the only one of the three not going through a named row
// component.
export function BlockedRow({
  blocked,
  busy,
  onUnblock,
}: {
  blocked: ConnectionUser
  busy: boolean
  onUnblock: () => void
}) {
  return (
    <Card>
      <CardContent>
        <Row className="justify-between">
          <Stack className="gap-0.5">
            <Text className="font-medium">{blocked.name}</Text>
            <Text className="text-sm text-muted-foreground">@{blocked.username}</Text>
          </Stack>
          <Button size="sm" variant="outline" disabled={busy} onPress={onUnblock}>
            Unblock
          </Button>
        </Row>
      </CardContent>
    </Card>
  )
}
