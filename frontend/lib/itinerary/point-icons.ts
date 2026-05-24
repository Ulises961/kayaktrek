import { Anchor, Circle, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { PointType } from "@/lib/dtos/point"

export const POINT_TYPE_META: Record<PointType, { label: string; Icon: LucideIcon }> = {
  stop: { label: "Stop", Icon: Anchor },
  position: { label: "Position", Icon: Circle },
  interest: { label: "Interest", Icon: Sparkles },
}
