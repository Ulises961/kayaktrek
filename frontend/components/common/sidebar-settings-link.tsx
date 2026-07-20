"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SettingsIcon } from "lucide-react"
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"

export function SidebarSettingsLink() {
  const pathname = usePathname() || ""
  const isActive = pathname === "/settings" || pathname.startsWith("/settings/")
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="xl:h-10 2xl:h-11 xl:[&>svg]:size-5 2xl:[&>svg]:size-6"
      >
        <Link href="/settings">
          <SettingsIcon />
          <span className="mx-1 2xl:text-base">Settings</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
