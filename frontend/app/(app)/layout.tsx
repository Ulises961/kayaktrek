import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { RequestsMenu } from "@/components/common/requests-menu"
import { KeypairPromptBanner } from "@/components/common/keypair-prompt-banner"
import { UserMenu } from "@/components/common/user-menu"
import { ContentAreaProvider } from "@/components/common/content-area-context"
import { ContentArea } from "@/components/common/content-area"
import { BreadcrumbProvider } from "@/components/common/breadcrumb-context"
import { HeaderBreadcrumb } from "@/components/common/header-breadcrumb"
import { BrandLockup } from "@/components/common/brand-lockup"
import { Separator } from "@/components/ui/separator"
import { getMe } from "@/lib/user/me"
import { getPendingRequestsSummary } from "@/lib/requests/actions"
import React from "react"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, pendingRequests] = await Promise.all([getMe(), getPendingRequestsSummary()])
  const hasKeypair = user?.hasKeypair ?? true

  return (
    <SidebarProvider>
      <ContentAreaProvider>
        <BreadcrumbProvider>
          {/* Shell: one full-width header strip across the top, the sidebar and
              the content area beneath it — the same arrangement as the landing,
              auth and terms pages, so the chrome reads as one application. */}
          <div className="flex min-h-svh w-full flex-col">
            {/* Nav bar — the chart-header shape (blur, bottom rule) of the
                landing/auth headers, tinted from --background rather than
                chart-paper so it unifies with the content below. Height is
                --app-header-h, which the sidebar offset also reads. */}
            <header className="chart-header-app sticky top-0 z-20 flex h-(--app-header-h) shrink-0 flex-row items-center gap-2 px-4">
              <SidebarTrigger className="md:hidden" />
              <Separator orientation="vertical" className="h-4 md:hidden" />
              {/* The mark lives here, not in the sidebar, which collapses to
                  icons and would take the brand with it. Wordmark drops below
                  md, where the breadcrumb needs the width more. */}
              <BrandLockup
                href="/dashboard"
                size={22}
                wordmarkClassName="hidden text-sm md:inline"
              />
              <div className="flex flex-1 items-center gap-3 ps-1">
                <HeaderBreadcrumb />
              </div>
              <RequestsMenu pendingRequests={pendingRequests} />
              <ThemeToggle />
              {/* Account-scoped chrome sits at the far right of the header, where
                  a signed-in user expects it — profile, settings and sign out all
                  hang off the avatar rather than off the sidebar's footer. */}
              <UserMenu
                account={
                  user && {
                    name: user.name,
                    surname: user.surname,
                    username: user.username,
                    mail: user.mail,
                    avatarUrl: user.avatarUrl,
                  }
                }
              />
            </header>

            {/* Sidebar + content share the space left under the header.
                min-h-0 lets the content column scroll instead of pushing the
                row taller than the viewport. */}
            <div className="flex min-h-0 w-full flex-1">
              <AppSidebar />
              <main className="flex w-full flex-col overflow-auto p-1 pt-4 md:p-4">
                <KeypairPromptBanner hasKeypair={hasKeypair} />
                <ContentArea>{children}</ContentArea>
              </main>
            </div>
          </div>
        </BreadcrumbProvider>
      </ContentAreaProvider>
    </SidebarProvider>
  )
}
