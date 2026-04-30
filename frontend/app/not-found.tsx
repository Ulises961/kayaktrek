import Link from "next/link"
import { StateVisual } from "@/components/illustrations/state-visual"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background">
      <StateVisual state="not-found" className="w-full max-w-sm" />
      <div className="text-center flex flex-col gap-2">
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">404</p>
        <h1 className="text-2xl font-semibold text-foreground">Destination not found</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          This page doesn&apos;t exist or has drifted off the chart.
        </p>
      </div>
      <Link
        href="/trips"
        className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
      >
        Back to your trips
      </Link>
    </div>
  )
}
