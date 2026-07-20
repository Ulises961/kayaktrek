"use client"
import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"
import type { Crumb } from "@/lib/types/ui"

type BreadcrumbContextValue = {
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  return (
    <BreadcrumbContext.Provider value={{ crumbs, setCrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbContext() {
  const context = useContext(BreadcrumbContext)
  if (!context) {
    throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider.")
  }
  return context
}
