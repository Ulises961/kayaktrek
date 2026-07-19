"use client"

import Link from "next/link"
import { StateVisual } from "@/components/illustrations/state-visual"
import { PageHeading } from "@/components/common/page-heading"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <StateVisual state="error" className="w-full max-w-sm" />
      <div className="flex flex-col gap-2 text-center">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">500</p>
        <PageHeading className="text-foreground">Lost bearing</PageHeading>
        <p className="text-muted-foreground max-w-xs text-sm">
          Something broke on our end. Try again or head back to safety.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="text-foreground hover:text-muted-foreground text-sm font-medium underline underline-offset-4 transition-colors"
        >
          Try again
        </button>
        <span className="text-muted-foreground text-sm">·</span>
        <Link
          href="/"
          className="text-foreground hover:text-muted-foreground text-sm font-medium underline underline-offset-4 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
