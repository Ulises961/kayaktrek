'use client'
import clsx from "clsx";
import { LifeBuoyIcon, NewspaperIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation"
import { GlobeAmericasIcon } from "../icons/heroicons-globe-americas";
import { UserGroupIcon } from "../icons/heroicons-user-group";
import { SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";

export function NavigationItems() {
    const pathname = usePathname() || "";
    const router = useRouter();

    const menuItems = [
        { title: "Trips", url: "/trips", icon: GlobeAmericasIcon },
        { title: "Inventory", url: "#", icon: LifeBuoyIcon },
        { title: "Buddies", url: "#", icon: UserGroupIcon },
        { title: "Logs", url: "#", icon: NewspaperIcon }
    ];

    return (
        <>
            {menuItems.map(item => (
                <SidebarMenuItem
                    key={item.title}
                    className={clsx({
                        'bg-sky-100 text-blue-600': pathname === item.url
                    })}
                >
                    <SidebarMenuButton
                        onClick={() => router.push(item.url)}
                        isActive={pathname === item.url}
                    >
                        <item.icon />
                        <span className="mx-1">{item.title}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </>
    )
}