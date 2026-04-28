import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function TripCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  )
}
