import { useState } from "react";
import { Image as RNImage, Pressable, ScrollView } from "react-native";

import type { Image as PointImage } from "@shared/dtos/image";

import { PhotoViewerModal } from "./photo-viewer-modal";

const THUMBNAIL_SIZE = 72;

// M34: a first, read-only step for viewing a point's photos on mobile — no
// upload/caption/visibility editing yet (mobile had no photo UI at all
// before this). Thumbnails open a fullscreen viewer (PhotoViewerModal) sized
// to actually look at, not a thumbnail — the same gap flagged when the Notes
// field turned out too small to be a real text field.
export function PhotoCarousel({ images }: { images: PointImage[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {images.map((image, index) => (
          <Pressable
            key={image.id ?? index}
            onPress={() => setViewerIndex(index)}
            testID={`photo-thumbnail-${index}`}
            accessibilityRole="button"
            accessibilityLabel={image.caption || `Photo ${index + 1}`}
          >
            <RNImage
              source={{ uri: image.location }}
              style={{
                width: THUMBNAIL_SIZE,
                height: THUMBNAIL_SIZE,
                borderRadius: 8,
              }}
            />
          </Pressable>
        ))}
      </ScrollView>

      <PhotoViewerModal
        images={images}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onChangeIndex={setViewerIndex}
      />
    </>
  );
}
