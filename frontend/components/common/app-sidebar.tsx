import Link from "next/link"
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
    SidebarRail,
} from "@/components/ui/sidebar"
import { SettingsIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { UserAvatar } from "@/components/common/user-avatar"
import { NavigationItems } from "./navigation-items"
import { SidebarLogoutButton } from "./sidebar-logout-button"

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
                {user && (
                    <Link
                        href="/profile"
                        className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:justify-center"
                    >
                        <UserAvatar name={user.name} surname={user.surname ?? undefined} imageUrl={user.avatarUrl ?? null} size="sm" />
                        <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
                            <span className="text-sm font-medium truncate">{displayName}</span>
                            <span className="text-xs text-muted-foreground truncate">{user.mail}</span>
                        </div>
                    </Link>
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
                <SidebarRail />
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            disabled
                            className="xl:h-10 xl:[&>svg]:size-5 2xl:h-11 2xl:[&>svg]:size-6 text-muted-foreground opacity-50 cursor-not-allowed"
                        >
                            <SettingsIcon />
                            <span className="mx-1 2xl:text-base">Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarLogoutButton />
                </SidebarMenu>
                <p className="text-[10px] text-muted-foreground px-2 pb-1 group-data-[collapsible=icon]:hidden">
                    v{APP_VERSION}
                </p>
            </SidebarFooter>
        </Sidebar>
    )
}