"use client"

import type { ReactNode } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

type RouteDetailSectionProps = {
  title: string
  defaultOpen: boolean
  children: ReactNode
}

/**
 * A titled block of the route detail panel that folds away. The panel is a phone-width
 * column, so a long pitch or a ten-day breakdown would otherwise push everything after
 * it — the call to action included — out of reach.
 */
export function RouteDetailSection({ title, defaultOpen, children }: RouteDetailSectionProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group border-border flex flex-col border-t pt-3"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}
