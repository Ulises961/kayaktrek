"use client"

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function SidebarToggleButton() {
  const { toggleSidebar, state, isMobile } = useSidebar()

  const collapsed = !isMobile && state === "collapsed"

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggleSidebar}
        tooltip={collapsed ? "Expand" : undefined}
        className="text-muted-foreground hover:text-foreground"
      >
        {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        <span className="group-data-[collapsible=icon]:hidden">
          {isMobile ? "Close" : "Collapse"}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
