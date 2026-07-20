"use client"

import { SlidersHorizontalIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface ListFilterPopoverProps {
  /** How many distinct filters are currently active — drives the trigger badge
   * and whether "Clear filters" renders. Callers count by filter concept (e.g.
   * a sea-state range counts as one, not two), not by raw field. */
  activeCount: number
  onClear: () => void
  children: React.ReactNode
  className?: string
}

// Shared "Filters" trigger + popover shell for list filter bars (trips,
// logs) — one place owning the disclosure/badge/clear-all chrome so each list
// only supplies its own filter fields as children (M12 §24 follow-up).
export function ListFilterPopover({
  activeCount,
  onClear,
  children,
  className,
}: ListFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <SlidersHorizontalIcon className="size-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("flex flex-col gap-4", className)}>
        {children}
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground -mt-1 h-7 gap-1 self-start px-1.5 text-xs"
          >
            <XIcon className="size-3" />
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
