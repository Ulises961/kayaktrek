import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Separator } from "@/components/ui/separator"
import React from "react"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex overflow-auto min-h-screen w-full p-1 md:p-4">
        <div className="w-full h-screen flex flex-col">
          {/* Nav bar */}
          <header className="h-12 border-b border-border flex flex-row items-center gap-2 px-4 mb-6 shrink-0">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            {/* Breadcrumb — each page renders its own via slot pattern */}
            <div id="breadcrumb-slot" className="flex-1 flex items-center" />
            <ThemeToggle />
          </header>
          <div className="flex-1 p-6 overflow-auto">
            {children}
          </div>
        </div>
      </main>
    </SidebarProvider>
  )
}
