import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function TripCardSkeleton() {
  return (
    <Card className="border-l-muted border-l-[3px]">
      <CardHeader className="px-3 pt-3 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5 px-3 pt-0 pb-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-28" />
      </CardContent>
    </Card>
  )
}
