import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  variant?: "panel" | "inline"
  // The section's own icon — the sidebar icon where this empty state is a nav
  // section, otherwise the icon already labelling that section elsewhere.
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  ghostRows?: number
  className?: string
  // Hyphenated JSX props typecheck even when the component drops them, so this
  // has to be forwarded explicitly or a call site's test hook fails silently.
  "data-testid"?: string
}

// The one empty state. Use it for "nothing exists yet", not for "your filter
// matched nothing": the filtered case is transient, the content does exist, and
// there is nothing to create, so it takes `inline` rather than a panel that
// flashes in and out as the reader types.
export function EmptyState({
  variant = "panel",
  icon: Icon,
  title,
  description,
  action,
  ghostRows = 0,
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <p
        data-slot="empty-state"
        data-testid={testId}
        className={cn("text-muted-foreground text-sm", className)}
      >
        {description ? `${title} ${description}` : title}
      </p>
    )
  }

  return (
    <div
      data-slot="empty-state"
      data-testid={testId}
      className={cn(
        // Spans its column edge to edge and claims no outer margin of its own:
        // a baked-in one collapses against a block sibling but adds to a flex
        // parent's gap, so the gap above belongs to the container.
        "border-border relative flex w-full flex-col items-center gap-5 overflow-hidden rounded-xl border border-dashed px-8 py-20 text-center",
        className,
      )}
    >
      {/* Chart rose, bleeding off the right edge. Inverted in dark mode, where
          black line art at this opacity would vanish into the surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-30 size-[22rem] -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.09] select-none dark:invert"
        style={{ backgroundImage: "url(/brand/chart-rose.svg)" }}
      />

      {Icon && <Icon className="text-muted-foreground/40 relative size-12" />}

      {ghostRows > 0 && (
        <div
          data-slot="empty-state-ghost"
          aria-hidden="true"
          className="relative flex w-full max-w-xs flex-col gap-2"
        >
          {Array.from({ length: ghostRows }, (_, row) => (
            <div
              key={row}
              data-slot="empty-state-ghost-row"
              className="bg-border/45 h-2 rounded-full"
              style={{ width: `${100 - row * 14}%` }}
            />
          ))}
        </div>
      )}

      <div className="relative flex flex-col gap-1">
        <p className="text-foreground text-base font-medium">{title}</p>
        {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      </div>

      {action && (
        <div
          data-slot="empty-state-action"
          className="relative flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
        >
          {action}
        </div>
      )}
    </div>
  )
}
