import { notFound, redirect } from "next/navigation"
import { format } from "date-fns"
import { AnchorIcon, ShieldAlertIcon, UserIcon } from "lucide-react"
import { apiGet, rethrowUnlessClientError } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripSchema } from "@/lib/dtos/trip"
import { LogisticsSchema } from "@/lib/dtos/logistics"
import { formatDateRange } from "@/lib/trips/format"
import { BackLink } from "@/components/common/back-link"
import { PrintButton } from "@/components/trips/print-button"
import { ShoreContactDetails } from "@/components/trips/float-plan-shore-contact-form"
import { FloatPlanCrewManifest } from "@/components/trips/float-plan-crew-manifest"
import { FloatPlanSection } from "@/components/trips/float-plan-section"
import { PageHeading } from "@/components/common/page-heading"

export default async function FloatPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let trip
  try {
    const raw = await apiGet(`/api/trip/${id}`)
    trip = TripSchema.parse(raw)
  } catch (error) {
    rethrowUnlessClientError(error)
    notFound()
  }

  const session = await getSession()
  const travellers = trip.travellers ?? []
  const leader = travellers.find((m) => m.role === "leader")
  const isLeader = !!session && !!leader && leader.user.id === session.userId

  if (!isLeader) redirect(`/trips/${id}`)

  const logistics = await apiGet(`/api/logistics/${id}`)
    .then((raw) => LogisticsSchema.parse(raw))
    .catch(() => null)

  const generatedAt = new Date()

  const dateLabel = formatDateRange(trip.dateFrom, trip.dateTo)

  const sortedCrew = [...travellers].sort((a, b) => {
    if (a.role === "leader") return -1
    if (b.role === "leader") return 1
    return 0
  })

  return (
    <div className="flex flex-col gap-6 text-base">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <BackLink href={`/trips/${id}`} label="Back to trip" size="xs" className="print:hidden" />
          <PageHeading>Float plan</PageHeading>
          <p className="text-lg font-medium">{trip.destination ?? "Unnamed expedition"}</p>
          <p className="text-muted-foreground text-base">{dateLabel}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
        </div>
      </div>

      <div className="border-border bg-muted/40 flex items-center gap-2 rounded-md border px-4 py-2 print:hidden">
        <ShieldAlertIcon className="size-4 shrink-0 text-[#d97706]" />
        <p className="text-muted-foreground text-sm">
          Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}. Print or save a copy before
          departure.
        </p>
      </div>

      {/* Generated timestamp for print */}
      <p className="text-muted-foreground hidden border-t pt-2 text-sm print:block">
        Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}
      </p>

      {/* Shore Contact */}
      <FloatPlanSection
        title="Shore Contact"
        icon={<AnchorIcon className="size-4 text-[#d97706]" />}
        className="rounded-lg border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-950/20"
      >
        <p className="text-muted-foreground -mt-1 mb-3 text-sm">
          Person who receives this float plan before departure.
        </p>
        <ShoreContactDetails contact={logistics ?? {}} />
      </FloatPlanSection>

      {/* Crew Manifest */}
      <FloatPlanSection
        title={`Crew Manifest (${sortedCrew.length})`}
        icon={<UserIcon className="size-4" />}
      >
        <FloatPlanCrewManifest crew={sortedCrew} tripId={id} />
      </FloatPlanSection>
    </div>
  )
}
