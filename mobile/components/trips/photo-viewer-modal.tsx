import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Image as RNImage, Pressable, View } from "react-native";

import type { Image as PointImage } from "@shared/dtos/image";

import { cn } from "@mobile/lib/cn";
import { FULLSCREEN_BACKDROP_CLASS, FullscreenModal } from "../ui/fullscreen-modal";
import { Text } from "../ui/text";

export function PhotoViewerModal({
  images,
  index,
  onClose,
  onChangeIndex,
}: {
  images: PointImage[];
  index: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const current = index !== null ? images[index] : null;

  function showPrevious() {
    if (index === null) return;
    onChangeIndex((index - 1 + images.length) % images.length);
  }

  function showNext() {
    if (index === null) return;
    onChangeIndex((index + 1) % images.length);
  }

  return (
    <FullscreenModal
      visible={current !== null}
      onClose={onClose}
      closeLabel="Close photo viewer"
    >
      <View className={cn("flex-1", FULLSCREEN_BACKDROP_CLASS)}>
        {current && (
          <RNImage
            source={{ uri: current.location }}
            className="flex-1"
            resizeMode="contain"
          />
        )}
      </View>

      {images.length > 1 && index !== null && (
        <>
          <Pressable
            onPress={showPrevious}
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
            hitSlop={12}
            className="absolute left-3 top-1/2 p-2"
          >
            <ChevronLeft size={28} color="white" />
          </Pressable>
          <Pressable
            onPress={showNext}
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            hitSlop={12}
            className="absolute right-3 top-1/2 p-2"
          >
            <ChevronRight size={28} color="white" />
          </Pressable>
          <Text className="absolute bottom-10 self-center text-sm text-white">
            {index + 1} / {images.length}
          </Text>
        </>
      )}
    </FullscreenModal>
  );
}
