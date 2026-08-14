import { cn } from "@/lib/utils"

/**
 * Thin maritime top rule — the chart-signature accent bar promoted from the auth
 * cartouche (M12 §E). Defaults to the ocean gradient (`.chart-top-rule` in
 * globals.css); pass a palette color from `lib/tokens` as `color` for a flat
 * variant — never hardcode hex at call sites (same contract as
 * AccentDialogContent). Position it with `className` (e.g. `absolute inset-x-0
 * top-0` inside a `relative overflow-hidden` card); unpositioned it renders as
 * a plain in-flow bar (the auth card's usage).
 */
export function CardTopRule({
  color,
  className,
  ...rest
}: { color?: string; className?: string } & React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("chart-top-rule", className)}
      style={color ? { background: color } : undefined}
      {...rest}
    />
  )
}
