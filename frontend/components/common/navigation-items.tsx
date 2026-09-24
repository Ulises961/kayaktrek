"use client"
import clsx from "clsx"
import {
  KayakIcon,
  LayoutDashboardIcon,
  PocketKnifeIcon,
  SignpostBigIcon,
  NewspaperIcon,
  CompassIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { UserGroupIcon } from "../icons/heroicons-user-group"
import { SidebarMenuItem, SidebarMenuButton, useSidebar } from "../ui/sidebar"

const EXPLORE_ITEM = { title: "Explore", url: "/explore", icon: CompassIcon }

const AUTHENTICATED_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Trips", url: "/trips", icon: KayakIcon },
  { title: "Itineraries", url: "/itinerary", icon: SignpostBigIcon },
  EXPLORE_ITEM,
  { title: "Gear", url: "/gear", icon: PocketKnifeIcon },
  { title: "Paddlers", url: "/paddlers", icon: UserGroupIcon },
  { title: "Logs", url: "/logs", icon: NewspaperIcon },
]

// A visitor the app cannot recognise is offered the one destination that works for them.
// `/explore` itself now redirects such a visitor to `/`, so this is what the shell shows
// in the moment it renders beside a gated page a stale cookie got past proxy.ts. Offering
// the rest sent every click to /login.
const ANONYMOUS_ITEMS = [EXPLORE_ITEM]

export function NavigationItems({ isAuthenticated = true }: { isAuthenticated?: boolean }) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()

  const menuItems = isAuthenticated ? AUTHENTICATED_ITEMS : ANONYMOUS_ITEMS

  return (
    <>
      {menuItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            onClick={() => {
              router.push(item.url)
              if (isMobile) setOpenMobile(false)
            }}
            isActive={pathname === item.url}
            className={clsx(
              "3xl:h-12 3xl:[&>svg]:size-7 xl:h-10 2xl:h-11 xl:[&>svg]:size-5 2xl:[&>svg]:size-6",
              {
                // Selected was `bg-sky-100 text-blue-600` — raw Tailwind literals, which
                // is why it read as *nearly* the card hover without ever matching it. Both
                // are `--accent` now, so "this is selected" and "this is hovered" are one
                // tint by construction. Dark mode came free; the literals had none.
                "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground":
                  pathname === item.url,
              },
            )}
          >
            <item.icon />
            <span className="mx-1 2xl:text-base">{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  )
}
