import Link from "next/link"
import { StateVisual } from "@/components/illustrations/state-visual"

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <StateVisual state="not-found" className="w-full max-w-sm" />
      <div className="flex flex-col gap-2 text-center">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">404</p>
        <h1 className="text-foreground text-2xl font-semibold">Destination not found</h1>
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
    </div>
  )
}
