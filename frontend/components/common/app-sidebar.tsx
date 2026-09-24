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
import packageJson from "@/package.json"

// Read from package.json rather than hardcoded — bumping the version at release time is
// what keeps this in sync automatically. It previously drifted to "0.1.0-dev" while the
// app shipped six releases past it, because nothing tied the two together.
const APP_VERSION = packageJson.version

export function AppSidebar({ isAuthenticated = true }: { isAuthenticated?: boolean }) {
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
        {/* A navigation landmark, which this had none of: the destinations rendered as a
            bare list, so a screen-reader user could not jump to the app's primary nav the
            way they can to `main` or a heading. The breadcrumb was the page's only <nav>,
            and it renders nothing when a page sets no crumbs. Also what
            `20-public-links-anonymous.spec.ts` looks for when it checks that an
            unrecognised visitor is offered no doors that only lead to /login. */}
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavigationItems isAuthenticated={isAuthenticated} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground px-2 pb-1 text-[10px] group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
