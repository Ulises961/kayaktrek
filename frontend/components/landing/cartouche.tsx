import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

// The "nautical chart" title-block furniture, promoted out of the landing hero so
// the DS owns it (showcased in /design). All visual styling lives in the unlayered
// `.chart-*` rules in globals.css; these are thin, composable wrappers over them.

// Double neat-line — the classic engraved chart border. Decorative only; render it
// inside a positioned, sized parent (it pins to `inset: 16px`).
export function NeatLine({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("chart-neatline", className)} {...props} />
}

// Cartouche — the chart title block, the landing's signature element. A chart-paper
// card with an engraved border; compose the parts below inside it.
export function Cartouche({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("chart-cartouche", className)} {...props} />
}

// Mono, wide-tracked label above the title (e.g. the region / discipline line).
export function CartoucheEyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("chart-eyebrow", className)} {...props} />
}

// Display-serif title. Wrap an <em> for the chart "water-name" italic accent.
export function CartoucheTitle({ className, ...props }: ComponentProps<"h1">) {
  return <h1 className={cn("chart-tagline", className)} {...props} />
}

// Fading hairline divider under the title.
export function CartoucheRule({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("chart-rule", className)} {...props} />
}

// Mono marginalia line under the rule (the invitation / fine print).
export function CartoucheNote({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("chart-invite", className)} {...props} />
}
