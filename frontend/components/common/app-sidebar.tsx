import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { NavigationItems } from "./navigation-items"
import { SidebarToggleButton } from "./sidebar-toggle-button"

const APP_VERSION = "0.1.0-dev"

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      {/* Header holds only the collapse toggle. The brand lives in the app
          shell's full-width header strip above this sidebar, so nothing here
          needs to line up with a content header any more. Account-scoped
          actions (profile, settings, sign out) live in that same header strip,
          under the avatar — so the sidebar carries navigation and nothing else. */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarToggleButton />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavigationItems />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground px-2 pb-1 text-[10px] group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
