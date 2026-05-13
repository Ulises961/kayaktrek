import { redirect } from "next/navigation"
import { getMyMembership } from "@/lib/trip-member/actions"
import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { FloatPlanEditForm } from "@/components/trips/float-plan-edit-form"
import { TripMedicalShareSection } from "@/components/trips/trip-medical-share-section"
import { Separator } from "@/components/ui/separator"

export default async function FloatPlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const membership = await getMyMembership(id)
  if (!membership) redirect(`/trips/${id}`)

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageBreadcrumb
        crumbs={[
          { label: "Trips", href: "/trips" },
          { label: "Trip", href: `/trips/${id}` },
          { label: "My float plan" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold">My float plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          For this trip only. Pre-filled from your profile defaults — update anything that differs.
        </p>
      </div>

      <FloatPlanEditForm tripId={id} membership={membership} />

      <Separator />

      <TripMedicalShareSection
        tripId={id}
        sharedAt={membership.medicalNotesConsentAt ?? null}
      />
    </div>
  )
}
