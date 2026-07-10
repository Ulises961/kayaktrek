import { CheckIcon } from "lucide-react"
import type { SaveStatus } from "@/hooks/use-save-status"

export function SaveStatusLine({ status }: { status: SaveStatus }) {
  if (status === "idle") return null
  if (status === "saving") {
    return <span className="text-muted-foreground text-[10px]">Saving…</span>
  }
  return (
    <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
      <CheckIcon className="size-3" />
      Saved
    </span>
  )
}
