import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { NavigationItems } from "./navigation-items"
import { SidebarLogoutButton } from "./sidebar-logout-button"
import { SidebarToggleButton } from "./sidebar-toggle-button"
import { SidebarProfileLink } from "./sidebar-profile-link"
import { SidebarSettingsLink } from "./sidebar-settings-link"

const APP_VERSION = "0.1.0-dev"

async function getSidebarUser() {
  try {
    const raw = await apiGet("/api/user/me")
    return UserSchema.parse(raw)
  } catch {
    return null
  }
}

export async function AppSidebar() {
  const user = await getSidebarUser()
  const displayName = [user?.name, user?.surname].filter(Boolean).join(" ") || user?.username || ""

  return (
    <Sidebar collapsible="icon">
      {/* Header holds only the collapse toggle — p-2 (8px) + the button's own
          h-8 (32px) + p-2 (8px) = 48px, matching the main content header's
          h-12 exactly (M12 B13, header-height unification). The profile link
          moved to the footer, grouped with the other account-scoped actions
          (Settings, Sign out) it always belonged next to. */}
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
        {user && (
          <>
            <SidebarProfileLink
              name={user.name}
              surname={user.surname ?? undefined}
              mail={user.mail}
              displayName={displayName}
              avatarUrl={user.avatarUrl ?? null}
            />
            <SidebarSeparator />
          </>
        )}
        <SidebarMenu>
          <SidebarSettingsLink />
          <SidebarLogoutButton />
        </SidebarMenu>
        <p className="text-muted-foreground px-2 pb-1 text-[10px] group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
