import type { ComponentType, ReactNode } from "react"
import { View } from "react-native"
import { SvgXml } from "react-native-svg"

import { CHART_ROSE_XML } from "../../assets/svg/chart-rose"
import { cn } from "../../lib/cn"
import { Stack } from "./layout"
import { Text } from "./text"

// Mobile port of frontend/components/common/empty-state.tsx's "panel" variant: a
// dashed-border panel with the same chart-rose watermark bleeding off the edge, so
// "nothing here yet" reads as a designed placeholder (mental continuity with web) rather
// than blank space. `ghostRows` isn't ported — no call site needs it yet.
export function EmptyPanel({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <View
      className={cn(
        "relative w-full items-center gap-3 overflow-hidden rounded-xl border border-dashed border-border px-8 py-16",
        className,
      )}
    >
      <SvgXml
        xml={CHART_ROSE_XML}
        width={140}
        height={140}
        style={{
          position: "absolute",
          top: "50%",
          right: -40,
          marginTop: -70,
          opacity: 0.16,
        }}
      />
      {/* Web's muted-foreground/40 (ocean500 at 40% opacity) — same faded "this is
          decorative, not a real icon button" read as the rest of the panel. */}
      <Icon size={48} color="rgba(34, 114, 182, 0.4)" strokeWidth={1.5} />
      <Stack className="items-center gap-1">
        <Text className="text-center text-base font-medium text-foreground">{title}</Text>
        {description && (
          <Text className="max-w-xs text-center text-sm text-muted-foreground">
            {description}
          </Text>
        )}
      </Stack>
      {action && <View className="pt-2">{action}</View>}
    </View>
  )
}
