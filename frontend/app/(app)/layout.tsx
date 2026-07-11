import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { KeypairPromptBanner } from "@/components/common/keypair-prompt-banner"
import { ContentAreaProvider } from "@/components/common/content-area-context"
import { ContentArea } from "@/components/common/content-area"
import { BreadcrumbProvider } from "@/components/common/breadcrumb-context"
import { HeaderBreadcrumb } from "@/components/common/header-breadcrumb"
import { Separator } from "@/components/ui/separator"
import { getMe } from "@/lib/user/me"
import React from "react"

async function getHasKeypair(): Promise<boolean> {
  const user = await getMe()
  return user?.hasKeypair ?? true
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const hasKeypair = await getHasKeypair()

  return (
    <SidebarProvider>
      <AppSidebar />
      <ContentAreaProvider>
        <BreadcrumbProvider>
          <main className="flex min-h-screen w-full overflow-auto p-1 md:p-4">
            <div className="flex h-screen w-full flex-col">
              {/* Nav bar */}
              <header className="border-border mb-6 flex h-12 shrink-0 flex-row items-center gap-2 border-b px-4">
                <SidebarTrigger className="md:hidden" />
                <Separator orientation="vertical" className="h-4 md:hidden" />
                <div className="flex flex-1 items-center">
                  <HeaderBreadcrumb />
                </div>
                <ThemeToggle />
              </header>
              <KeypairPromptBanner hasKeypair={hasKeypair} />
              <ContentArea>{children}</ContentArea>
            </div>
          </main>
        </BreadcrumbProvider>
      </ContentAreaProvider>
    </SidebarProvider>
  )
}
