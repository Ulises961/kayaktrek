export default function TripDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>Trip {params.id}</div>
  )
}
