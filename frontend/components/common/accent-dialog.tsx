"use client"

import type { LucideIcon } from "lucide-react"
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CardTopRule } from "@/components/common/card-top-rule"

/**
 * Dialog body with the app's chart chrome: the maritime top rule and an icon-led title.
 *
 * The rule is the same `CardTopRule` the cards and the auth cartouche use — one fixed
 * gradient everywhere, so it reads as "our chrome" and carries no per-dialog meaning.
 *
 * It deliberately takes no colour. Each call site used to pass a palette colour, which
 * spent the role hues on decoration: ocean on trip and vehicle dialogs, foam on documents
 * and logs, sunset on logistics and — worst of it — on Resume expedition, tinting a
 * safety control with the call-to-action colour. Ten dialogs across three colours is not a
 * code anyone could learn, and it left amber and teal too common to mean anything where
 * they are load-bearing (`/design` §3: each role has one colour). Decoration is now
 * uniform so the roles can be rare.
 */
export function AccentDialogContent({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <DialogContent className="max-w-lg overflow-hidden p-0">
      <CardTopRule data-testid="accent-dialog-bar" />
      <div className="p-6">
        <DialogHeader className="mb-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="text-muted-foreground size-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {children}
      </div>
    </DialogContent>
  )
}
