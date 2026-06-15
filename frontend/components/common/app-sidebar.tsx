import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { SettingsIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { NavigationItems } from "./navigation-items"
import { SidebarLogoutButton } from "./sidebar-logout-button"
import { SidebarToggleButton } from "./sidebar-toggle-button"
import { SidebarProfileLink } from "./sidebar-profile-link"

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarToggleButton />
        </SidebarMenu>
        <SidebarSeparator />
        {user && (
          <SidebarProfileLink
            name={user.name}
            surname={user.surname ?? undefined}
            mail={user.mail}
            displayName={displayName}
            avatarUrl={user.avatarUrl ?? null}
          />
        )}
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              className="text-muted-foreground cursor-not-allowed opacity-50 xl:h-10 2xl:h-11 xl:[&>svg]:size-5 2xl:[&>svg]:size-6"
            >
              <SettingsIcon />
              <span className="mx-1 2xl:text-base">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarLogoutButton />
        </SidebarMenu>
        <p className="text-muted-foreground px-2 pb-1 text-[10px] group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
