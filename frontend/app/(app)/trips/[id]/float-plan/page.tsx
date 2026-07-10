import { notFound, redirect } from "next/navigation"
import { format } from "date-fns"
import { AnchorIcon, LinkIcon, ShieldAlertIcon, UserIcon } from "lucide-react"
import React from "react"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripSchema } from "@/lib/dtos/trip"
import { LogisticsSchema } from "@/lib/dtos/logistics"
import { formatDateRange } from "@/lib/trips/format"
import { BackLink } from "@/components/common/back-link"
import { PrintButton } from "@/components/trips/print-button"
import { ShoreContactForm } from "@/components/trips/float-plan-shore-contact-form"
import { FloatPlanCrewManifest } from "@/components/trips/float-plan-crew-manifest"
import { FloatPlanShareSection } from "@/components/trips/float-plan-share-section"

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mb-3 flex items-center gap-2 border-b pb-1.5 text-sm font-semibold tracking-[0.08em] uppercase">
      {icon}
      {children}
    </h2>
  )
}

export default async function FloatPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let trip
  try {
    const raw = await apiGet(`/api/trip/${id}`)
    trip = TripSchema.parse(raw)
  } catch {
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
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <BackLink href={`/trips/${id}`} label="Back to trip" size="xs" className="print:hidden" />
          <h1 className="text-2xl font-bold tracking-tight">Float Plan</h1>
          <p className="text-base font-medium">{trip.destination ?? "Unnamed expedition"}</p>
          <p className="text-muted-foreground text-sm">{dateLabel}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
        </div>
      </div>

      <div className="border-border bg-muted/40 flex items-center gap-2 rounded-md border px-4 py-2 print:hidden">
        <ShieldAlertIcon className="size-4 shrink-0 text-[#d97706]" />
        <p className="text-muted-foreground text-xs">
          Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}. Print or save a copy before
          departure.
        </p>
      </div>

      {/* Generated timestamp for print */}
      <p className="text-muted-foreground hidden border-t pt-2 text-xs print:block">
        Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}
      </p>

      {/* Shore Contact */}
      <section className="rounded-lg border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
        <SectionHeading icon={<AnchorIcon className="size-3.5 text-[#d97706]" />}>
          Shore Contact
        </SectionHeading>
        <p className="text-muted-foreground -mt-1 mb-3 text-xs">
          Person who receives this float plan before departure.
        </p>
        <ShoreContactForm tripId={id} logistics={logistics} />
      </section>

      {/* Share link */}
      <section className="border-border bg-muted/30 rounded-lg border p-4 print:hidden">
        <SectionHeading icon={<LinkIcon className="size-3.5" />}>Share</SectionHeading>
        <p className="text-muted-foreground -mt-1 mb-3 text-xs">
          Generate a read-only link for your shore contact. The link contains vessel descriptions
          and emergency contacts — no medical notes.
        </p>
        <FloatPlanShareSection tripId={id} logistics={logistics} />
      </section>

      {/* Crew Manifest */}
      <section>
        <SectionHeading icon={<UserIcon className="size-3.5" />}>
          Crew Manifest ({sortedCrew.length})
        </SectionHeading>
        <FloatPlanCrewManifest crew={sortedCrew} tripId={id} />
      </section>
    </div>
  )
}
