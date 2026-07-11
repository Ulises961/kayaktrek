"use client"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useContentArea } from "./content-area-context"

export function ContentArea({ children }: { children: ReactNode }) {
  const { fullBleed } = useContentArea()
  return (
    <div className={cn("flex-1 overflow-auto", fullBleed ? "relative" : "p-6")}>{children}</div>
  )
}
