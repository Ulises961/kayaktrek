"use client"

import Link from "next/link"
import { StateVisual } from "@/components/illustrations/state-visual"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background">
      <StateVisual state="error" className="w-full max-w-sm" />
      <div className="text-center flex flex-col gap-2">
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">500</p>
        <h1 className="text-2xl font-semibold text-foreground">Lost bearing</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Something broke on our end. Try again or head back to safety.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
        >
          Try again
        </button>
        <span className="text-muted-foreground text-sm">·</span>
        <Link
          href="/trips"
          className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
        >
          Back to your trips
        </Link>
      </div>
    </div>
  )
}
