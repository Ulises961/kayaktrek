'use client'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/common/app-sidebar"
import React from "react"
export default function Layout({ children }: { children: React.ReactNode }) {

  const [open, setOpen] = React.useState(false)

  return (
    <SidebarProvider

      open={open} onOpenChange={setOpen}>
      <AppSidebar />
      <main className="flex overflow-auto min-h-screen w-full">        
        {children}
      </main>
    </SidebarProvider>
  )
}