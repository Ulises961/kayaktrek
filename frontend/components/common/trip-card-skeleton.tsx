import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function TripCardSkeleton() {
  return (
    <Card className="border-l-[3px] border-l-muted">
      <CardHeader className="pb-1.5 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-0.5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-28" />
      </CardContent>
    </Card>
  )
}
