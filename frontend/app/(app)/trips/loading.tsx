import { TripCardSkeleton } from "@/components/common/trip-card-skeleton"

export default function Loading() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <TripCardSkeleton key={i} />
      ))}
    </div>
  )
}
