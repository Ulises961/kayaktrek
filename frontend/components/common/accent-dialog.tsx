"use client"

import type { LucideIcon } from "lucide-react"
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Dialog body with the app's accent-bar chrome: a colored top bar and an
 * icon-tinted title, as used by the logistics dialogs. Pass a palette color
 * from `lib/tokens` as `accent` — don't hardcode hex values at call sites.
 */
export function AccentDialogContent({
  accent,
  icon: Icon,
  title,
  children,
}: {
  accent: string
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <DialogContent className="max-w-lg overflow-hidden p-0">
      <div
        data-testid="accent-dialog-bar"
        className="h-1 w-full"
        style={{ backgroundColor: accent }}
      />
      <div className="p-6">
        <DialogHeader className="mb-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4" style={{ color: accent }} />
            {title}
          </DialogTitle>
        </DialogHeader>
        {children}
      </div>
    </DialogContent>
  )
}
