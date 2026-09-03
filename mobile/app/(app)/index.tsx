// Placeholder authenticated home — WP1 proves the auth+nav shell round-trips end to end
// (login -> token stored -> this screen -> sign out -> back to login). The real trip list
// is WP2 (plans/M9b.md); this keeps the WP5 watchFolders proof (frontend/lib/tokens.ts,
// frontend/lib/dtos/point) alive rather than deleting it, since it's still validating the
// same cross-workspace import path WP2 will lean on for real DTOs.
import { palette } from "../../../frontend/lib/tokens"
import { PointSchema } from "../../../frontend/lib/dtos/point"

import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Row, Screen, Stack } from "../../components/ui/layout"
import { Text } from "../../components/ui/text"
import { useAuth } from "../../lib/auth/auth-context"

const mockLaunchPoint = PointSchema.parse({
  type: "stop",
  name: "Porthmadog slipway",
  notes: "High-water launch only — check the rule of twelfths before setting off.",
})

export default function HomeScreen() {
  const { signOut } = useAuth()

  return (
    <Screen>
      <Stack className="flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <Row>
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
        <Button variant="outline" onPress={signOut} testID="sign-out">
          Sign out
        </Button>
      </Stack>
    </Screen>
  )
}
