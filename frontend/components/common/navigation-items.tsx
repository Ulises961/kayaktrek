'use client'
import clsx from "clsx";
import { LifeBuoyIcon, NewspaperIcon, MailIcon } from "lucide-react";
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
        { title: "Invitations", url: "/invitations", icon: MailIcon },
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
                        className="xl:h-10 xl:[&>svg]:size-5 2xl:h-11 2xl:[&>svg]:size-6 3xl:h-12 3xl:[&>svg]:size-7"
                    >
                        <item.icon />
                        <span className="mx-1 2xl:text-base">{item.title}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </>
    )
}