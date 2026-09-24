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
import { getViewer, hasLiveSession } from "@/lib/user/me"
import { getPendingRequestsSummary } from "@/lib/requests/actions"
import React from "react"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getViewer, not getMe: the shell must not be the thing that demands a session. Auth for
  // the genuinely gated segments stays where it belongs, in proxy.ts, with each page's own
  // authenticated fetch redirecting if a live token is revoked mid-session.
  //
  // The anonymous branch below is not dead now that `/explore` redirects a visitor it does
  // not recognise: proxy.ts gates on a cookie *existing*, so a stale one still reaches a
  // gated page, and this layout renders alongside the page whose own fetch will bounce it.
  // Offering that visitor the full nav is what M23 §1 closed, so the shell keeps answering
  // the question for itself rather than assuming a rendered `(app)` route means signed in.
  const [user, pendingRequests, isAuthenticated] = await Promise.all([
    getViewer(),
    getPendingRequestsSummary(),
    hasLiveSession(),
  ])
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
            {/* z-[1100], not z-20. Leaflet's own panes run to z-index 1000, and a map —
                a route thumbnail on a trip card, the explore map — is not inside a
                stacking context that contains them, so at z-20 the header was painted
                *under* the map it was supposed to sit above. Same reason the frontend
                CLAUDE.md requires z-[1001]+ for anything overlaid on a map; the app chrome
                is overlaid on a map too, it just does not look like it. */}
            <header className="chart-header-app sticky top-0 z-[1100] flex h-(--app-header-h) shrink-0 flex-row items-center gap-2 px-4">
              <SidebarTrigger className="md:hidden" />
              <Separator orientation="vertical" className="h-4 md:hidden" />
              {/* The mark lives here, not in the sidebar, which collapses to
                  icons and would take the brand with it. Wordmark drops below
                  md, where the breadcrumb needs the width more — the subtitle
                  matches that same gate so it never shows without the wordmark. */}
              <BrandLockup
                href={isAuthenticated ? "/dashboard" : "/"}
                size={22}
                wordmarkClassName="hidden text-sm md:inline"
                subtitle="Sea-kayak expedition planner"
                subtitleClassName="hidden md:inline-flex"
              />
              {/* min-w-0 is load-bearing from `sm` up, where the trail renders: a flex
                  item defaults to min-width:auto, so `flex-1` alone will not shrink this
                  below its content and a longer trail shoves the trailing controls off the
                  viewport — the responsive canary's first real red, on /settings,
                  /settings/change-password and /profile/edit. Below `sm` this stays as the
                  spacer that keeps requests, theme and account against the right edge. */}
              <div className="flex min-w-0 flex-1 items-center gap-3 ps-1">
                <HeaderBreadcrumb />
              </div>
              {/* Nobody is waiting on a visitor who is not signed in — the summary is
                  empty for them by construction, so the bell would only ever be a dead
                  control. */}
              {isAuthenticated && <RequestsMenu pendingRequests={pendingRequests} />}
              <ThemeToggle />
              {/* Account-scoped chrome sits at the far right of the header, where
                  a signed-in user expects it — profile, settings and sign out all
                  hang off the avatar rather than off the sidebar's footer. */}
              <UserMenu
                isAuthenticated={isAuthenticated}
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
              <AppSidebar isAuthenticated={isAuthenticated} />
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
