"use client"

import { useTransition } from "react"
import { LogOutIcon } from "lucide-react"
import { logout } from "@/lib/auth/actions"
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"

export function SidebarLogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => startTransition(() => logout())}
        disabled={isPending}
        className="xl:h-10 xl:[&>svg]:size-5 2xl:h-11 2xl:[&>svg]:size-6 text-muted-foreground"
      >
        <LogOutIcon />
        <span className="mx-1 2xl:text-base">{isPending ? "Signing out…" : "Sign out"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
