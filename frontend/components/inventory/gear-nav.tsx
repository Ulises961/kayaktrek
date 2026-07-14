"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BackpackIcon, ListChecksIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Segment nav for the Gear area (mirrors TripDetailNav) — "My kit" is the
// personal closet, "Default template" the M10 curated CatalogItem editor that
// seeds every new trip's shared requirements (M12 §F: two conceptually
// different surfaces, no longer stacked in one column).
export function GearNav() {
  const pathname = usePathname()

  const items = [
    { href: "/gear", label: "My kit", icon: BackpackIcon },
    { href: "/gear/templates", label: "Default template", icon: ListChecksIcon },
  ]

  return (
    <nav className="border-border flex w-full gap-1 overflow-x-auto border-b">
      {items.map((item) => {
        const isActive = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            <Icon className="size-3.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
