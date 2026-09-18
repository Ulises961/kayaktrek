import { Link } from "expo-router"
import { Pressable } from "react-native"

import type { ConnectionUser } from "@shared/dtos/connection"
import { formatPaddlerName } from "@shared/user/format"

import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

export type ConnectionDirection = "incoming" | "outgoing" | "accepted"

// A dumb renderer — the screen resolves both `counterparty` (whichever side of the
// connection isn't the caller) and `direction` (which needs the caller's own user id
// to know), since neither is derivable from the connection row alone.
export function ConnectionRow({
  counterparty,
  direction,
  busy,
  onAccept,
  onRemove,
  onBlock,
}: {
  counterparty: ConnectionUser
  direction: ConnectionDirection
  busy: boolean
  onAccept: () => void
  onRemove: () => void
  onBlock: () => void
}) {
  return (
    <Card>
      <CardContent>
        <Row className="justify-between">
          {/* Same link treatment as PaddlerResultCard — see its comment on why the
              link role is declared rather than inherited. */}
          <Link
            href={{ pathname: "/paddlers/[username]", params: { username: counterparty.username } }}
            asChild
          >
            <Pressable accessibilityRole="link" accessibilityLabel={formatPaddlerName(counterparty)}>
              <Stack className="gap-0.5">
                <Text className="font-medium">{formatPaddlerName(counterparty)}</Text>
                <Text className="text-sm text-muted-foreground">@{counterparty.username}</Text>
              </Stack>
            </Pressable>
          </Link>
          <Row className="gap-2">
            {direction === "incoming" && (
              <Button size="sm" disabled={busy} onPress={onAccept}>
                Accept
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onPress={onRemove}>
              {direction === "incoming"
                ? "Decline"
                : direction === "outgoing"
                  ? "Cancel"
                  : "Remove"}
            </Button>
            {direction === "accepted" && (
              <Button size="sm" variant="destructive" disabled={busy} onPress={onBlock}>
                Block
              </Button>
            )}
          </Row>
        </Row>
      </CardContent>
    </Card>
  )
}
