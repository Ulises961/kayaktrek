import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";

// Deliberately NOT `transparent` — a transparent Android Modal doesn't
// reliably composite above MapLibre's native map surface, so its content can
// render behind the map while still owning all touch input: reads as a
// frozen app, not a visual glitch (found on-device).
//
// `children` supplies its own backdrop View; this only owns the Modal
// wrapper and the close button.
export const FULLSCREEN_BACKDROP_CLASS = "bg-[#060f1c]/95";

export function FullscreenModal({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1">
        {children}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={12}
          className="absolute right-5 top-12 p-2"
        >
          <X size={24} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}
