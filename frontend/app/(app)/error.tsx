"use client"

import { useEffect } from "react"
import { TriangleAlertIcon, RotateCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the failure to the browser console / error reporting rather than
    // letting it disappear. Server-side errors arrive here with only a digest.
    console.error(error)
  }, [error])

  return (
    <div className="flex max-w-2xl flex-col gap-8 p-6">
      <section className="border-border flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <TriangleAlertIcon className="text-muted-foreground/40 size-10" />
        <div>
          <p className="font-medium">Something went wrong</p>
          <p className="text-muted-foreground mt-1 text-sm">
            We couldn&apos;t load this page. Try again — if it keeps happening, the problem is on
            our side.
          </p>
          {error.digest && (
            <p className="text-muted-foreground/60 mt-2 font-mono text-xs">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <Button size="sm" onClick={reset}>
          <RotateCwIcon className="mr-1.5 size-4" />
          Try again
        </Button>
      </section>
    </div>
  )
}
