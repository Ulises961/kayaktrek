import { Link } from "expo-router"
import { Pressable } from "react-native"

import type { PaddlerSearchResult } from "@shared/dtos/paddler-search"
import { formatPaddlerName } from "@shared/user/format"

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
          {/* Matches web, where the name and handle are one link to the public
              profile. `accessibilityRole` is declared rather than inherited: web's
              <a> carries the link role for free, a Pressable announces as a button
              unless told otherwise. */}
          <Link
            href={{ pathname: "/paddlers/[username]", params: { username: paddler.username } }}
            asChild
          >
            <Pressable accessibilityRole="link" accessibilityLabel={formatPaddlerName(paddler)}>
              <Stack className="gap-0.5">
                <Text className="font-medium">{formatPaddlerName(paddler)}</Text>
                <Text className="text-sm text-muted-foreground">@{paddler.username}</Text>
              </Stack>
            </Pressable>
          </Link>
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
