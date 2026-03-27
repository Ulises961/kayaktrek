import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import React from "react"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex overflow-auto min-h-screen w-full p-1">
        <div className="w-full h-screen flex flex-col">
          {/* Nav bar */}
          <div className="h-auto border-b border-slate-200 flex flex-row items-center mb-10">
            <SidebarTrigger />
            <div className="flex-1" />
            {/* User menu — placeholder until M3a */}
            <div className="w-8 h-8 rounded-full bg-slate-200 mr-2" />
          </div>
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
