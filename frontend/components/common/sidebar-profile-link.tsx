"use client"

import Link from "next/link"
import { useSidebar } from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/common/user-avatar"

interface SidebarProfileLinkProps {
  name: string
  surname?: string
  mail: string
  displayName: string
  avatarUrl: string | null
}

export function SidebarProfileLink({
  name,
  surname,
  mail,
  displayName,
  avatarUrl,
}: SidebarProfileLinkProps) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Link
      href="/profile"
      onClick={() => {
        if (isMobile) setOpenMobile(false)
      }}
      className="hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors group-data-[collapsible=icon]:justify-center"
    >
      <UserAvatar name={name} surname={surname} imageUrl={avatarUrl} size="sm" />
      <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-medium">{displayName}</span>
        <span className="text-muted-foreground truncate text-xs">{mail}</span>
      </div>
    </Link>
  )
}
