import React from "react"
import { cn } from "@/lib/utils"
import { Cartouche } from "@/components/landing/cartouche"
import { CardTopRule } from "@/components/common/card-top-rule"

interface AuthCardProps {
  children: React.ReactNode
  className?: string
}

// Auth surface is the landing's Cartouche — a chart-paper card floating on the
// frozen chart backdrop (see (auth)/layout.tsx). The thin accent bar at the top
// keeps the maritime gradient signature of the old card.
export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <Cartouche className={cn("overflow-hidden", className)}>
      <CardTopRule />
      <div className="flex flex-col gap-5 p-8">{children}</div>
    </Cartouche>
  )
}

export function AuthCardHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="auth-heading">{title}</h1>
      {subtitle && <p className="auth-subheading">{subtitle}</p>}
    </div>
  )
}
