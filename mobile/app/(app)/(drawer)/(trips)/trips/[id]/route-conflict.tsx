import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker } from "@maplibre/maplibre-react-native"
import { Stack as RouterStack, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Alert, ScrollView, View } from "react-native"

import { palette } from "@shared/tokens"

import { Button } from "@mobile/components/ui/button"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { NeedsConnectionNotice } from "@mobile/components/ui/offline-notice"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { isOfflineError } from "@mobile/lib/api/client"
import { fetchServerRoute, loadEditableRoute, resolveRouteConflict } from "@mobile/lib/db/route-edit"
import { isTripLeader } from "@mobile/lib/db/trip-role"
import { type RouteDifference, compareRoutes } from "@mobile/lib/itinerary/route-compare"
import { type EditableRoute, orderedPoints } from "@mobile/lib/itinerary/route-edits"
import { boundsOf } from "@mobile/lib/map/bounds"
import { MAP_STYLE } from "@mobile/lib/map/tiles"

const header = <RouterStack.Screen options={{ title: "Route changed elsewhere" }} />

const GROUPS: { kind: RouteDifference["kind"]; label: string }[] = [
  { kind: "only-mine", label: "Only on this phone" },
  { kind: "only-theirs", label: "Only in the other version" },
  { kind: "moved", label: "Moved on the map" },
  { kind: "day-changed", label: "In a different day" },
  { kind: "details-changed", label: "Name, type or notes changed" },
]

function lineOf(route: EditableRoute) {
  const coordinates = orderedPoints(route.points)
    .filter((point) => point.latitude !== null && point.longitude !== null)
    .map((point) => [point.longitude as number, point.latitude as number] as [number, number])
  return {
    type: "FeatureCollection" as const,
    features:
      coordinates.length > 1
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } }]
        : [],
  }
}

// M9d WP4: the route was changed elsewhere while the leader edited it on this
// phone, so the push was refused. Resolving is never a blind "keep mine / keep
// theirs": both versions are drawn on one map, the differences listed, and only
// then the choice — applied as a command, replacing the route for everyone
// (sync-protocol-spec.md §8.3–§8.4).
export default function RouteConflictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [mine, setMine] = useState<EditableRoute | null>(null)
  const [theirs, setTheirs] = useState<EditableRoute | null>(null)
  const [isLeader, setIsLeader] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadEditableRoute(id), isTripLeader(id)]).then(([local, leader]) => {
      if (cancelled) return
      setMine(local)
      setIsLeader(leader)
    })
    fetchServerRoute(id)
      .then((server) => {
        if (!cancelled) setTheirs(server)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load the other version.")
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const comparison = useMemo(() => (mine && theirs ? compareRoutes(mine, theirs) : null), [mine, theirs])
  const bounds = useMemo(
    () => boundsOf([...(mine?.points ?? []), ...(theirs?.points ?? [])].flatMap((point) =>
      point.latitude !== null && point.longitude !== null
        ? [{ latitude: point.latitude, longitude: point.longitude }]
        : [],
    )),
    [mine, theirs],
  )

  function choose(keep: "mine" | "theirs") {
    const [title, message, action] =
      keep === "mine"
        ? ["Keep your route?", "Your route replaces the other version for everyone.", "Keep my route"]
        : ["Use the other version?", "Your edits on this phone are discarded.", "Use the other version"]
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: action,
        style: "destructive",
        onPress: async () => {
          setResolving(true)
          setResolveError(null)
          try {
            await resolveRouteConflict(id, keep)
            router.back()
          } catch (error) {
            setResolveError(error instanceof Error ? error.message : "Couldn't resolve the conflict.")
          } finally {
            setResolving(false)
          }
        },
      },
    ])
  }

  if (loadError) {
    const offline = isOfflineError(loadError)
    return (
      <Screen edges={["bottom"]} className="items-center justify-center p-6">
        {header}
        <NeedsConnectionNotice visible={offline}>Comparing routes needs a connection.</NeedsConnectionNotice>
        <Text className="text-center text-muted-foreground">
          {offline
            ? "Comparing routes needs a connection. Until then this phone keeps showing your route."
            : loadError}
        </Text>
      </Screen>
    )
  }

  if (!mine || !theirs || !comparison || isLeader === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  const onlyMine = new Set(comparison.differences.filter((d) => d.kind === "only-mine").map((d) => d.pointId))
  const onlyTheirs = new Set(comparison.differences.filter((d) => d.kind === "only-theirs").map((d) => d.pointId))

  return (
    <Screen edges={["bottom"]}>
      {header}
      <View style={{ height: 280 }}>
        <MapLibreMap mapStyle={MAP_STYLE} style={{ flex: 1 }} androidView="texture">
          <Camera initialViewState={bounds ? { bounds } : { center: [0, 20], zoom: 1 }} />
          <GeoJSONSource id="route-theirs" data={lineOf(theirs)} testID="route-theirs">
            <Layer
              id="route-theirs-line"
              type="line"
              paint={{ "line-color": palette.sunset600, "line-width": 3, "line-dasharray": [2, 2] }}
            />
          </GeoJSONSource>
          <GeoJSONSource id="route-mine" data={lineOf(mine)} testID="route-mine">
            <Layer id="route-mine-line" type="line" paint={{ "line-color": palette.ocean500, "line-width": 3 }} />
          </GeoJSONSource>
          {[...mine.points.filter((point) => onlyMine.has(point.id)), ...theirs.points.filter((point) => onlyTheirs.has(point.id))]
            .filter((point) => point.latitude !== null && point.longitude !== null)
            .map((point) => (
              <Marker key={point.id} id={point.id} lngLat={[point.longitude as number, point.latitude as number]}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: "white",
                    backgroundColor: onlyMine.has(point.id) ? palette.ocean500 : palette.sunset600,
                  }}
                />
              </Marker>
            ))}
        </MapLibreMap>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-4">
        <Row className="gap-4">
          <Text className="text-xs" style={{ color: palette.ocean500 }}>━ Your route</Text>
          <Text className="text-xs" style={{ color: palette.sunset600 }}>┅ The other version</Text>
        </Row>

        {comparison.differences.length === 0 && !comparison.orderDiffers && (
          <Text className="text-sm text-muted-foreground">
            The points are the same; the day dates or boundaries differ.
          </Text>
        )}
        {GROUPS.map(({ kind, label }) => {
          const items = comparison.differences.filter((difference) => difference.kind === kind)
          if (items.length === 0) return null
          return (
            <Stack key={kind} className="gap-1">
              <SectionLabel>{label}</SectionLabel>
              {items.map((difference) => (
                <Text key={difference.pointId} className="text-sm">
                  {difference.name || "Unnamed point"}
                </Text>
              ))}
            </Stack>
          )
        })}
        {comparison.orderDiffers && (
          <Text className="text-sm text-muted-foreground">The stops you both have are in a different order.</Text>
        )}

        {isLeader ? (
          <Stack className="gap-2 pt-2">
            {resolveError && <Text className="text-sm text-destructive">{resolveError}</Text>}
            <Button onPress={() => choose("mine")} disabled={resolving} testID="keep-mine">
              Keep my route
            </Button>
            <Button variant="outline" onPress={() => choose("theirs")} disabled={resolving} testID="keep-theirs">
              Use the other version
            </Button>
          </Stack>
        ) : (
          <Text className="text-sm text-muted-foreground">Only the trip leader can resolve this.</Text>
        )}
      </ScrollView>
    </Screen>
  )
}
