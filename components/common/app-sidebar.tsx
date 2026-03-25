import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarRail,
} from "@/components/ui/sidebar"
import { LifeBuoyIcon, NewspaperIcon, Plus } from "lucide-react"
import { NavigationItems } from "./navigation-items"
import { GlobeAmericasIcon } from "../icons/heroicons-globe-americas";
import { UserGroupIcon } from "../icons/heroicons-user-group";

export function AppSidebar() {
    const menuItems = [
        { title: "Trips", url: "/trips", icon: GlobeAmericasIcon },
        { title: "Inventory", url: "#", icon: LifeBuoyIcon },
        { title: "Buddies", url: "#", icon: UserGroupIcon },
        { title: "Logs", url: "#", icon: NewspaperIcon }
    ];

    return (
        <Sidebar collapsible="icon">

            <SidebarHeader>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        Actions
                    </SidebarGroupLabel>
                    <SidebarGroupAction>
                        <Plus />
                    </SidebarGroupAction>

                    <SidebarGroupContent>
                        <SidebarMenu>
                            <NavigationItems />
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

            </SidebarContent>

            <SidebarFooter>
                <SidebarRail />
                Footer
            </SidebarFooter>

        </Sidebar>
    )
}