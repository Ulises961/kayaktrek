"use client"

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface FloatPlanSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}

// Expanded by default — this is a safety document meant to be scanned at a
// glance, not a form that starts hidden. The collapse affordance exists to
// declutter a long crew list on screen, not to hide content by default.
// Printing always shows every section fully open (see globals.css @media print).
export function FloatPlanSection({ title, icon, children, className }: FloatPlanSectionProps) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("group", className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 border-b pb-2 text-left print:pointer-events-none">
        <span className="text-foreground flex items-center gap-2 text-base font-semibold tracking-[0.04em] uppercase">
          {icon}
          {title}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90 print:hidden" />
      </CollapsibleTrigger>
      {/* forceMount — a printed float plan must show every section in full
          regardless of on-screen collapse state (see globals.css @media
          print); without it, Radix unmounts closed content entirely and no
          print CSS could bring it back. */}
      <CollapsibleContent forceMount className="pt-3 data-[state=closed]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
