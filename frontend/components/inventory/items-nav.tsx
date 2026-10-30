"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BackpackIcon, PackageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ItemsNavProps {
  tripId: string
  /** Only trip members have a private kit — non-members see requirements read-only. */
  showKit: boolean
}

// Sub-segment nav inside the trip Items area (M12 §P, §R's route-segment
// precedent): group requirements (collaborative) vs My kit (private) are
// conceptually different checklists, each with its own URL.
export function ItemsNav({ tripId, showKit }: ItemsNavProps) {
  const pathname = usePathname()

  const items = [
    {
      href: `/trips/${tripId}/items`,
      label: "Group requirements",
      shortLabel: "Group",
      icon: PackageIcon,
    },
    ...(showKit
      ? [
          {
            href: `/trips/${tripId}/items/kit`,
            label: "My kit",
            shortLabel: "Mine",
            icon: BackpackIcon,
          },
        ]
      : []),
  ]

  if (items.length < 2) return null

  return (
    <nav className="flex w-full gap-1 overflow-x-auto">
      {items.map((item) => {
        const isActive = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              isActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span aria-hidden className="sm:hidden">
              {item.shortLabel}
            </span>
            <span className="sr-only sm:not-sr-only">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
