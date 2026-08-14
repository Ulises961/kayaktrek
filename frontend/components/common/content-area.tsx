"use client"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useContentArea } from "./content-area-context"

// The one place the app decides how a page uses space — horizontal via the
// layout modes (see ContentLayout in ./content-area-context for why each
// exists), vertical via the gap below.
//
// The padded modes are a flex column with a single gap, so a page returns its
// sections as siblings and the shell spaces them. Pages must not set their own
// vertical margins between top-level sections: those margins collapse against
// a block sibling but *add* to a flex gap, which is how the same empty-state
// panel ended up sitting 24px below the heading on Trips and 56px below it on
// the dashboard.
//
// Horizontal padding steps at sm because M18's floor is 320px, below Tailwind's
// smallest breakpoint — so the base value is the phone value and the wider one
// layers on, never the reverse.
export function ContentArea({ children }: { children: ReactNode }) {
  const { layout } = useContentArea()
  return (
    <div
      className={cn(
        "flex-1 overflow-auto",
        layout === "bleed" && "relative",
        layout === "wide" && "flex flex-col gap-6 p-4 sm:p-6",
        layout === "column" && "flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6",
      )}
    >
      {children}
    </div>
  )
}
