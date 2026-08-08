import React from "react"
import { cn } from "@/lib/utils"
import { Cartouche, CartoucheRule } from "@/components/landing/cartouche"
import { CardTopRule } from "@/components/common/card-top-rule"

interface AuthCardProps {
  children: React.ReactNode
  className?: string
}

// The auth surface is the landing's Cartouche — a chart-paper card on the frozen
// chart backdrop (see (auth)/layout.tsx), in its solid variant so the form holds
// one colour whatever the chart draws behind it.
export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <Cartouche className={cn("chart-cartouche-solid overflow-hidden", className)}>
      <CardTopRule />
      <div className="flex flex-col gap-5 p-8">{children}</div>
    </Cartouche>
  )
}

// Title block in the cartouche's own grammar: title, hairline rule, then the
// card's contents. The rule is the landing title block's CartoucheRule, so the
// two surfaces read as one family.
export function AuthCardHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="auth-heading">{title}</h1>
      {subtitle && <p className="auth-subheading">{subtitle}</p>}
      <CartoucheRule className="mt-2.5" />
    </div>
  )
}
