import Link from "next/link"
import { SUPPORT_MAIL } from "@/lib/support"

const linkClass = "hover:text-foreground text-sm underline underline-offset-2"

export function LegalSection() {
  return (
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
      <Link href="/about" className={linkClass}>
        About
      </Link>
      <Link href="/terms" className={linkClass}>
        Terms of Use
      </Link>
      <Link href="/privacy" className={linkClass}>
        Privacy Policy
      </Link>
      <Link href={`mailto:${SUPPORT_MAIL}`} className={linkClass}>
        Contact
      </Link>
    </div>
  )
}
