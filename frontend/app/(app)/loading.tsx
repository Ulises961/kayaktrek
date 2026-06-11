import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
  return (
    <div data-testid="page-loading" className="flex animate-pulse flex-col gap-6">
      {/* Page header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Primary content card */}
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>

      {/* Secondary content card */}
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}
