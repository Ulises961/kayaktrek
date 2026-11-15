import { CheckIcon, PencilIcon } from "lucide-react-native";

import { palette } from "@shared/tokens";

import { Button } from "../ui/button";

// The itinerary header's switch between view mode and edit mode (M42). Whether to render it at all
// is the caller's call (`canEditRoute`): this only says which way the next press goes.
export function EditModeButton({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  const Icon = editing ? CheckIcon : PencilIcon;
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onToggle}
      icon={<Icon size={16} color={palette.ocean700} />}
      testID="edit-mode-toggle"
    >
      {editing ? "Done" : "Edit"}
    </Button>
  );
}
