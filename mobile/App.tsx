import { StatusBar } from "expo-status-bar"

// Reused verbatim from the sibling `frontend/` workspace over Metro's `watchFolders`
// (metro.config.js) — no copy, no new workspace tooling. This is WP5's end-to-end proof:
// Metro resolution -> NativeWind -> tokens -> DTOs all have to work for this screen to
// render at all. See plans/M9.md item 11 / plans/M9a.md WP5.
import { palette } from "../frontend/lib/tokens"
import { PointSchema } from "../frontend/lib/dtos/point"

import { Badge } from "./components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { Row, Screen, Stack } from "./components/ui/layout"
import { Text } from "./components/ui/text"

// A Zod-validated mock Point — the same DTO the web itinerary builder validates route
// points with. Parsing (not just type-asserting) it is the point: an invalid shape here
// would throw before render, same as it would on web.
const mockLaunchPoint = PointSchema.parse({
  type: "stop",
  name: "Porthmadog slipway",
  notes: "High-water launch only — check the rule of twelfths before setting off.",
})

export default function App() {
  return (
    <Screen>
      <Stack className="flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <Row>
              {/* `bg-ocean-600` resolves through tailwind.config.js's `colors.ocean`,
                  which is `palette` re-exported into the Tailwind theme — the class name
                  and the imported constant below are the same source of truth. */}
              <Badge className="bg-ocean-600">
                <Text className="text-xs font-medium text-white">Route point</Text>
              </Badge>
            </Row>
            <CardTitle>{mockLaunchPoint.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-muted-foreground">{mockLaunchPoint.notes}</Text>
            <Text className="text-xs text-muted-foreground">
              Ocean 600 swatch: {palette.ocean600}
            </Text>
          </CardContent>
        </Card>
      </Stack>
      <StatusBar style="auto" />
    </Screen>
  )
}
