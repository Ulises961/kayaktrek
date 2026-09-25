import { CloudUpload, TriangleAlert, X } from "lucide-react-native"
import { Pressable, View } from "react-native"

import { palette } from "@shared/tokens"

import { describeChange, useQueuedChanges } from "../../lib/network/queued-changes"
import { Text } from "./text"

function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`
}

// Rendered by every Screen, under the offline banner (M9d). Changes made offline
// wait on the phone until a sweep can send them; this says how many are waiting,
// and — whatever the connection — lists any the server refused, with its reason,
// until the paddler dismisses them. A refused change that vanished silently would
// leave someone believing their float plan or their kit list said something it
// does not.
export function QueuedChangesNotice() {
  const { pending, rejected, dismiss } = useQueuedChanges()
  if (pending.length === 0 && rejected.length === 0) return null

  return (
    <View className="gap-2 border-b border-border bg-card px-4 py-2">
      {pending.length > 0 && (
        <View className="flex-row items-center gap-2">
          <CloudUpload size={16} color={palette.ocean500} />
          <Text className="text-xs text-muted-foreground">
            {changes(pending.length)} waiting to send.
          </Text>
        </View>
      )}
      {rejected.length > 0 && (
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <TriangleAlert size={16} color={palette.sunset600} />
            <Text className="text-xs font-medium text-sunset-600">
              {`${changes(rejected.length)} couldn't be applied.`}
            </Text>
          </View>
          {rejected.map((change) => {
            const description = describeChange(change)
            return (
              <View key={change.mutationId} className="flex-row items-start gap-2 pl-6">
                <View className="flex-1">
                  <Text className="text-xs font-medium">{description}</Text>
                  {change.reason && (
                    <Text className="text-xs text-muted-foreground">{change.reason}</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => void dismiss(change.mutationId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${description}`}
                  hitSlop={8}
                  className="-my-1 p-1.5"
                >
                  <X size={14} color={palette.ocean500} />
                </Pressable>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
