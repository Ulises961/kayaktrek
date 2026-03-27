import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import React, { Suspense } from "react"
import { headers } from "next/headers"
export default async function Layout({ children }: { children: React.ReactNode }) {
    return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex overflow-auto min-h-screen w-full p-1">
        {/* Container */}
        <div className="w-full h-screen flex flex-col">
          {/* Nav bar */}
          <div className="h-auto border-b-1 border-slate-400 flex flex-row mb-10">
            <SidebarTrigger />
            <div className=":empty w-full" ></div>
            <div className="bg-red-500 min-w-25"></div>
          </div>
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}