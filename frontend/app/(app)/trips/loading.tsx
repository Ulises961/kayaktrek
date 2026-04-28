import { TripCardSkeleton } from "@/components/common/trip-card-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-3 mt-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <TripCardSkeleton key={i} />
      ))}
    </div>
  )
}
