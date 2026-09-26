import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface BackLinkProps {
  href: string
  label: string
  /** "inline" sits in app chrome (token-based colors). "floating" is glyph + text
   *  positioned directly over a map with no surrounding chrome — same plain-text
   *  treatment, just a drop-shadow for legibility over variable tile colors instead
   *  of a background. Not a pill/FAB; the caller positions it via `className`. */
  variant?: "inline" | "floating"
  /** "sm" (default) matches app-chrome back links (map top bar). "xs" matches the
   *  compact document-header context (float plan). */
  size?: "xs" | "sm"
  className?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}

export function BackLink({
  href,
  label,
  variant = "inline",
  size = "sm",
  className,
  onClick,
}: BackLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex w-fit min-w-0 items-center transition-colors",
        size === "sm" && "gap-1.5 text-sm",
        size === "xs" && "gap-1 text-xs",
        variant === "inline" && "text-muted-foreground hover:text-foreground",
        variant === "floating" && "font-medium text-slate-700 drop-shadow-sm hover:text-slate-900",
        className,
      )}
    >
      <ArrowLeftIcon className={cn("shrink-0", size === "sm" ? "size-4" : "size-3")} />
      {label}
    </Link>
  )
}
