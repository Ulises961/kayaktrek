import { Badge } from "@mobile/components/ui/badge"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Row, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import type { CrewStatusRow } from "@mobile/lib/live/crew-status"

const LEADER = "leader"

// Who is on the trip and when each was last heard from. Quiet rows read lighter, never red: a phone
// standing still sends nothing by design.
export function CrewStatusList({ rows }: { rows: CrewStatusRow[] }) {
  return (
    <Card>
      <CardContent className="gap-3">
        <SectionLabel>Crew</SectionLabel>
        {rows.length === 0 && <Text className="text-sm text-muted-foreground">No crew on this phone yet.</Text>}
        <Stack className="gap-3">
          {rows.map((row) => (
            <Row key={row.userId} className="items-center justify-between gap-3">
              <Stack className="flex-1 gap-0.5">
                <Row className="items-center gap-2">
                  <Text className="font-medium" numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.role === LEADER && <Badge variant="outline">Leader</Badge>}
                </Row>
                <Text className={row.quiet ? "text-sm text-muted-foreground" : "text-sm"}>
                  {row.heardAgo ?? "No position shared yet"}
                </Text>
              </Stack>
            </Row>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}
