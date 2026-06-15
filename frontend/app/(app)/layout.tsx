import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { KeypairPromptBanner } from "@/components/common/keypair-prompt-banner"
import { Separator } from "@/components/ui/separator"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import React from "react"

async function getHasKeypair(): Promise<boolean> {
  try {
    const raw = await apiGet("/api/user/me")
    const user = UserSchema.parse(raw)
    return user.hasKeypair ?? true
  } catch {
    return true
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const hasKeypair = await getHasKeypair()

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex min-h-screen w-full overflow-auto p-1 md:p-4">
        <div className="flex h-screen w-full flex-col">
          {/* Nav bar */}
          <header className="border-border mb-6 flex h-12 shrink-0 flex-row items-center gap-2 border-b px-4">
            <SidebarTrigger className="md:hidden" />
            <Separator orientation="vertical" className="h-4 md:hidden" />
            {/* Breadcrumb — each page renders its own via slot pattern */}
            <div id="breadcrumb-slot" className="flex flex-1 items-center" />
            <ThemeToggle />
          </header>
          <KeypairPromptBanner hasKeypair={hasKeypair} />
          <div className="flex-1 overflow-auto p-6">{children}</div>
        </div>
      </main>
    </SidebarProvider>
  )
}
