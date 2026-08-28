import Link from "next/link"
import { BrandMark } from "@/components/common/brand-mark"
import { cn } from "@/lib/utils"

interface BrandLockupProps {
  // "/" from the public surfaces; the authenticated shell points it at the
  // dashboard, which is home once you are signed in.
  href?: string
  size?: number
  className?: string
  wordmarkClassName?: string
}

// Mark + wordmark, shared by every header (landing, auth, terms, app shell) so
// the name lives at exactly one call site.
export function BrandLockup({
  href = "/",
  size = 26,
  className,
  wordmarkClassName,
}: BrandLockupProps) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {/* Wordmark only — no descriptor. This sits in a slim chart-publication strip
          beside a 26px mark and has to hold at the 320px floor, which is exactly
          where a tagline would either wrap or push the header wide. The descriptor
          lives in the page title and the landing copy instead. */}
      <span className={cn("chart-wordmark", wordmarkClassName)}>Kayaktrek</span>
    </Link>
  )
}
