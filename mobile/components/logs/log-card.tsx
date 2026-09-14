import { ClockIcon, RouteIcon, WavesIcon } from "lucide-react-native"
import { Link } from "expo-router"
import { Pressable } from "react-native"

import type { Log } from "@shared/dtos/log"
import { formatDayDate } from "@shared/utils/date"
import { beaufortLabel } from "@shared/weather/beaufort"
import { lightTokens } from "@shared/tokens"

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"

// Mirrors the icon-row micro-typography M9b2 established on TripCard (11px meta
// rows, tabular-nums, muted-foreground icons) rather than porting web's
// logs-tabs.tsx row layout verbatim.
export function LogCard({ log }: { log: Log }) {
  return (
    <Link href={{ pathname: "/logs/[id]", params: { id: log.id ?? "" } }} asChild>
      <Pressable>
        <Card>
          <CardHeader>
            <Row className="justify-between">
              <CardTitle className="flex-1" numberOfLines={1}>
                {formatDayDate(log.date)}
              </CardTitle>
              {!!log.endorsementCount && (
                <Text className="text-[11px] text-muted-foreground">
                  {log.endorsementCount}{" "}
                  {log.endorsementCount === 1 ? "endorsement" : "endorsements"}
                </Text>
              )}
            </Row>
          </CardHeader>
          <CardContent>
            <Row className="flex-wrap gap-x-3 gap-y-1">
              {log.hours != null && (
                <Row className="items-center gap-1">
                  <ClockIcon size={12} color={lightTokens.mutedForeground} />
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    {log.hours.toFixed(1)}h
                  </Text>
                </Row>
              )}
              {log.distance != null && (
                <Row className="items-center gap-1">
                  <RouteIcon size={12} color={lightTokens.mutedForeground} />
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    {log.distance.toFixed(1)} km
                  </Text>
                </Row>
              )}
              {log.avgSea != null && (
                <Row className="items-center gap-1">
                  <WavesIcon size={12} color={lightTokens.mutedForeground} />
                  <Text className="text-[11px] text-muted-foreground">
                    B{log.avgSea} · {beaufortLabel(log.avgSea)}
                  </Text>
                </Row>
              )}
            </Row>
          </CardContent>
        </Card>
      </Pressable>
    </Link>
  )
}
