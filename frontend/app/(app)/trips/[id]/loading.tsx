import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function Loading() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Crew card */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-5 w-14 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Itinerary stub card */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
