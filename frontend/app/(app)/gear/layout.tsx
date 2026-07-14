import type { ReactNode } from "react"
import { GearNav } from "@/components/inventory/gear-nav"

// Shared shell for the Gear area's two route segments (M12 §F, mirroring the
// trips/[id] layout/nav pattern): /gear (personal kit) and /gear/templates
// (the curated default-template editor).
export default function GearLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Gear closet</h1>
        <p className="text-muted-foreground text-sm">
          Your personal kit and the default template new trips start from.
        </p>
      </div>
      <GearNav />
      {children}
    </div>
  )
}
