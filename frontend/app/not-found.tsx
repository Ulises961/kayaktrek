import Link from "next/link"
import { StateVisual } from "@/components/illustrations/state-visual"
import { PageHeading } from "@/components/common/page-heading"
import { RoseCredit } from "@/components/illustrations/rose-credit"

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      {/* The rose is portrait — capped by height rather than width so it can't
          run off a short viewport, which a max-w cap on a 450×760 box does. */}
      <StateVisual state="not-found" className="max-h-[min(62vh,30rem)] w-auto" />
      <div className="flex flex-col gap-2 text-center">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">404</p>
        <PageHeading className="text-foreground">Destination not found</PageHeading>
        <p className="text-muted-foreground max-w-xs text-sm">
          This page doesn&apos;t exist or has drifted off the chart.
        </p>
      </div>
      <Link
        href="/"
        className="text-foreground hover:text-muted-foreground text-sm font-medium underline underline-offset-4 transition-colors"
      >
        Back to home
      </Link>
      <RoseCredit />
    </div>
  )
}
