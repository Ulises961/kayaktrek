import {
  Stack as RouterStack,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { Anchor, CircleDot } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";

import type { Image as PointImage } from "@shared/dtos/image";
import { POINT_TYPE } from "@shared/dtos/point";
import { palette } from "@shared/tokens";

import { PhotoCarousel } from "@mobile/components/trips/photo-carousel";
import {
  PointForm,
  type PointFormValues,
} from "@mobile/components/trips/point-form";
import { Label } from "@mobile/components/ui/label";
import { Row, Screen, Stack } from "@mobile/components/ui/layout";
import { Text } from "@mobile/components/ui/text";
import { requestPush } from "@mobile/lib/db/push-pending";
import { editRoute, loadEditableRoute } from "@mobile/lib/db/route-edit";
import { isTripLeader } from "@mobile/lib/db/trip-role";
import { READ_ONLY_PARAM } from "@mobile/lib/itinerary/edit-mode";
import {
  type EditableRoute,
  editPoint,
} from "@mobile/lib/itinerary/route-edits";

// Parses the `images` route param (itinerary.tsx's handleEditPoint) back into
// the shape PhotoCarousel wants. Guarded, not trusted: a malformed or missing
// param degrades to "no photos" rather than crashing the screen.
function parseImagesParam(raw: string | undefined): PointImage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PointImage[];
  } catch {
    return [];
  }
}

// One screen for every role, mirroring web's PointDetailModal `canEdit`
// split: editable inputs for the leader, plain read-only text for crew.
// Pushes straight away on save; a failed push isn't an error here since the
// sweep retries it later.
export default function EditPointScreen() {
  const {
    id,
    pointId,
    images: imagesParam,
    readOnly,
  } = useLocalSearchParams<{
    id: string;
    pointId: string;
    images?: string;
    readOnly?: string;
  }>();
  const router = useRouter();
  const [route, setRoute] = useState<EditableRoute | null>(null);
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = parseImagesParam(imagesParam);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadEditableRoute(id), isTripLeader(id)]).then(
      ([loaded, leader]) => {
        if (cancelled) return;
        setRoute(loaded);
        setIsLeader(leader);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(values: PointFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await editRoute(id, (current) =>
        editPoint(current, pointId, {
          name: values.name.trim() || null,
          notes: values.notes.trim() || null,
          type: values.type,
        }),
      );
      requestPush();
      router.back();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save the change.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const point = route?.points.find((candidate) => candidate.id === pointId);
  // M42: the itinerary's view mode asks for the read-only view even from a leader.
  const canEditPoint = isLeader === true && readOnly !== READ_ONLY_PARAM;
  const header = (
    <RouterStack.Screen options={{ title: canEditPoint ? "Edit point" : "Point" }} />
  );

  if (!route || isLeader === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!point) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center p-6">
        {header}
        <Text className="text-center text-muted-foreground">
          This point is no longer on the route.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {canEditPoint ? (
          <PointForm
            initial={{
              name: point.name ?? "",
              notes: point.notes ?? "",
              type:
                point.type === POINT_TYPE.STOP
                  ? POINT_TYPE.STOP
                  : POINT_TYPE.POSITION,
            }}
            submitLabel="Save point"
            submitting={submitting}
            error={error}
            onSubmit={(values) => void handleSave(values)}
          />
        ) : (
          <Stack className="gap-4">
            <Row className="items-center gap-1.5">
              {point.type === POINT_TYPE.STOP ? (
                <Anchor size={14} color={palette.ocean500} />
              ) : (
                <CircleDot size={14} color={palette.ocean500} />
              )}
              <Text className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {point.type ?? "position"}
              </Text>
            </Row>
            <Text className="text-lg font-semibold">
              {point.name || point.type || "position"}
            </Text>

            <Stack className="gap-1">
              <Label>Notes</Label>
              {point.notes ? (
                <ScrollView
                  nestedScrollEnabled
                  className="max-h-40 rounded-md border border-input p-3"
                >
                  <Text className="text-base leading-6">{point.notes}</Text>
                </ScrollView>
              ) : (
                <Text className="text-sm italic text-muted-foreground">
                  No notes for this point.
                </Text>
              )}
            </Stack>
          </Stack>
        )}

        {images.length > 0 && (
          <Stack className="mt-6 gap-2">
            <Label>Photos</Label>
            <PhotoCarousel images={images} />
          </Stack>
        )}
      </ScrollView>
    </Screen>
  );
}
