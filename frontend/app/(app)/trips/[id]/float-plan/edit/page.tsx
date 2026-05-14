import { redirect } from "next/navigation"

export default async function FloatPlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/trips/${id}?tab=float-plan`)
}
