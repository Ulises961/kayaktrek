import React from "react"
import { cn } from "@/lib/utils"

interface AuthCardProps {
  children: React.ReactNode
  className?: string
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div className={cn("auth-card", className)}>
      <div className="auth-card-accent" aria-hidden />
      <div className="flex flex-col gap-5 p-8">{children}</div>
    </div>
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
