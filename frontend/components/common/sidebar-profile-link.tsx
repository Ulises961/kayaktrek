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

export function SidebarProfileLink({ name, surname, mail, displayName, avatarUrl }: SidebarProfileLinkProps) {
    const { isMobile, setOpenMobile } = useSidebar()

    return (
        <Link
            href="/profile"
            onClick={() => { if (isMobile) setOpenMobile(false) }}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:justify-center"
        >
            <UserAvatar name={name} surname={surname} imageUrl={avatarUrl} size="sm" />
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium truncate">{displayName}</span>
                <span className="text-xs text-muted-foreground truncate">{mail}</span>
            </div>
        </Link>
    )
}
