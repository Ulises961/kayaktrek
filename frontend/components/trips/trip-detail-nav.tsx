"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AnchorIcon,
  MapPinIcon,
  PackageIcon,
  RadioTowerIcon,
  ShieldAlertIcon,
  UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TripDetailNavProps {
  tripId: string
  /** Only current trip members have their own vessel/emergency/medical info to edit. */
  showFloatPlan: boolean
  /** Set only while the trip is happening and the caller is a member (M8 Navigate
   * mode). Points at /itinerary/<id>?navigate=1 — outside /trips/<id>/…, so it's
   * an outbound link and deliberately never active-matches like the other tabs. */
  liveHref?: string
}

export function TripDetailNav({ tripId, showFloatPlan, liveHref }: TripDetailNavProps) {
  const pathname = usePathname()

  const items = [
    ...(liveHref ? [{ href: liveHref, label: "Live", icon: RadioTowerIcon }] : []),
    { href: `/trips/${tripId}`, label: "Itinerary", icon: MapPinIcon },
    { href: `/trips/${tripId}/crew`, label: "Crew", icon: UsersIcon },
    ...(showFloatPlan
      ? [
          {
            href: `/trips/${tripId}/my-float-plan`,
            label: "Emergency info",
            icon: ShieldAlertIcon,
          },
        ]
      : []),
    { href: `/trips/${tripId}/logistics`, label: "Logistics", icon: AnchorIcon },
    { href: `/trips/${tripId}/items`, label: "Items", icon: PackageIcon },
  ]

  return (
    <nav className="border-border flex w-full gap-1 overflow-x-auto border-b">
      {items.map((item) => {
        // Exact match for the base segment (/trips/[id] would prefix-match every
        // sibling); prefix match for the others so sub-segments like
        // /items/kit keep their parent tab lit (M12 §P).
        const isActive =
          pathname === item.href ||
          (item.href !== `/trips/${tripId}` && pathname.startsWith(`${item.href}/`))
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
