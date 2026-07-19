import type { ReactNode } from "react"
import { GearNav } from "@/components/inventory/gear-nav"
import { PageHeading } from "@/components/common/page-heading"

// Shared shell for the Gear area's two route segments (M12 §F, mirroring the
// trips/[id] layout/nav pattern): /gear (personal kit) and /gear/templates
// (the curated default-template editor).
export default function GearLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <PageHeading>Gear closet</PageHeading>
        <p className="text-muted-foreground text-sm">
          Your personal kit and the default template new trips start from.
        </p>
      </div>
      <GearNav />
      {children}
    </div>
  )
}
