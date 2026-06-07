'use client'
import clsx from "clsx";
import { LifeBuoyIcon, MapPinIcon, NewspaperIcon, MailIcon, CompassIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation"
import { GlobeAmericasIcon } from "../icons/heroicons-globe-americas";
import { UserGroupIcon } from "../icons/heroicons-user-group";
import { SidebarMenuItem, SidebarMenuButton, useSidebar } from "../ui/sidebar";

export function NavigationItems() {
    const pathname = usePathname() || "";
    const router = useRouter();
    const { isMobile, setOpenMobile } = useSidebar();

    const menuItems = [
        { title: "Trips", url: "/trips", icon: GlobeAmericasIcon },
        { title: "Itineraries", url: "/itinerary", icon: MapPinIcon },
        { title: "Explore", url: "/explore", icon: CompassIcon },
        { title: "Invitations", url: "/invitations", icon: MailIcon },
        { title: "Inventory", url: "#", icon: LifeBuoyIcon },
        { title: "Buddies", url: "#", icon: UserGroupIcon },
        { title: "Logs", url: "/logs", icon: NewspaperIcon },
    ];

    return (
        <>
            {menuItems.map(item => (
                <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                        onClick={() => { router.push(item.url); if (isMobile) setOpenMobile(false); }}
                        isActive={pathname === item.url}
                        className={clsx(
                            "xl:h-10 xl:[&>svg]:size-5 2xl:h-11 2xl:[&>svg]:size-6 3xl:h-12 3xl:[&>svg]:size-7",
                            { "bg-sky-100 text-blue-600 hover:bg-sky-100 hover:text-blue-600": pathname === item.url }
                        )}
                    >
                        <item.icon />
                        <span className="mx-1 2xl:text-base">{item.title}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </>
    )
}