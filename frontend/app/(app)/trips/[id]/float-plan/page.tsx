import { notFound, redirect } from "next/navigation"
import { format } from "date-fns"
import { AnchorIcon, ShieldAlertIcon, UserIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { TripSchema } from "@/lib/dtos/trip"
import { LogisticsSchema, type Logistics } from "@/lib/dtos/logistics"
import { PrintButton } from "@/components/trips/print-button"
import type { TripMember } from "@/lib/dtos/trip-member"

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  try { return format(new Date(iso), "d MMM yyyy") } catch { return iso }
}

function formatLength(cm: number | null | undefined) {
  if (!cm) return null
  return `${(cm / 100).toFixed(2)} m`
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground border-b pb-1.5 mb-3">
      {icon}
      {children}
    </h2>
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function ShoreContactBlock({ logistics }: { logistics: Logistics | null }) {
  const { shoreContactName, shoreContactEmail, shoreContactPhone, shoreContactRelationship } = logistics ?? {}
  const hasAny = shoreContactName || shoreContactEmail || shoreContactPhone

  return (
    <section className="rounded-lg border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
      <SectionHeading icon={<AnchorIcon className="size-3.5 text-[#d97706]" />}>Shore Contact</SectionHeading>
      {hasAny ? (
        <div className="flex flex-col gap-1.5">
          <FieldRow label="Name" value={shoreContactName} />
          <FieldRow label="Relationship" value={shoreContactRelationship} />
          <FieldRow label="Phone" value={shoreContactPhone} />
          <FieldRow label="Email" value={shoreContactEmail} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No shore contact recorded.</p>
      )}
    </section>
  )
}

function VesselBlock({ member }: { member: TripMember }) {
  const { vesselMake, vesselModel, vesselLengthCm, vesselColorPrimary, vesselColorSecondary } = member
  const hasVessel = vesselMake || vesselModel || vesselLengthCm || vesselColorPrimary

  if (!hasVessel) return <p className="text-sm text-muted-foreground italic">No vessel info recorded.</p>

  const colors = [vesselColorPrimary, vesselColorSecondary].filter(Boolean).join(" / ")

  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Make / Model" value={[vesselMake, vesselModel].filter(Boolean).join(" ") || null} />
      <FieldRow label="Length" value={formatLength(vesselLengthCm)} />
      <FieldRow label="Colour" value={colors || null} />
    </div>
  )
}

function EmergencyBlock({ member }: { member: TripMember }) {
  const { emergencyContactName, emergencyContactPhone, emergencyContactRelationship } = member
  const hasEmergency = emergencyContactName || emergencyContactPhone

  if (!hasEmergency) return <p className="text-sm text-muted-foreground italic">No emergency contact recorded.</p>

  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Name" value={emergencyContactName} />
      <FieldRow label="Relationship" value={emergencyContactRelationship} />
      <FieldRow label="Phone" value={emergencyContactPhone} />
    </div>
  )
}

function MemberCard({ member }: { member: TripMember }) {
  const fullName = [member.user.name, member.user.surname].filter(Boolean).join(" ")
  const showMedical = !!member.medicalNotesConsentAt && !!member.medicalNotes

  return (
    <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="font-semibold">{fullName}</span>
          {member.user.mail && <span className="text-xs text-muted-foreground">{member.user.mail}</span>}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {member.role}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Vessel</p>
          <VesselBlock member={member} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Emergency Contact</p>
          <EmergencyBlock member={member} />
        </div>
      </div>

      {showMedical && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive mb-1">Medical Notes</p>
          <p className="text-sm whitespace-pre-wrap">{member.medicalNotes}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5">Consent given {formatDate(member.medicalNotesConsentAt)}</p>
        </div>
      )}

      {member.floatPlanConfirmedAt && (
        <p className="text-[10px] text-muted-foreground">
          Float plan confirmed {formatDate(member.floatPlanConfirmedAt)}
        </p>
      )}
    </div>
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

  const dateRange = [trip.dateFrom, trip.dateTo].filter(Boolean)
  const dateLabel = dateRange.length === 2
    ? `${formatDate(dateRange[0])} – ${formatDate(dateRange[1])}`
    : dateRange.length === 1
    ? formatDate(dateRange[0])
    : "Dates not set"

  const sortedCrew = [...travellers].sort((a, b) => {
    if (a.role === "leader") return -1
    if (b.role === "leader") return 1
    return 0
  })

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Float Plan</h1>
          <p className="text-base font-medium mt-0.5">{trip.destination ?? "Unnamed expedition"}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        <PrintButton />
      </div>

      <div className="rounded-md border border-border bg-muted/40 px-4 py-2 flex items-center gap-2 print:hidden">
        <ShieldAlertIcon className="size-4 text-[#d97706] shrink-0" />
        <p className="text-xs text-muted-foreground">
          Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}. Print or save a copy before departure.
        </p>
      </div>

      {/* Generated timestamp for print */}
      <p className="hidden print:block text-xs text-muted-foreground border-t pt-2">
        Generated {format(generatedAt, "d MMM yyyy 'at' HH:mm")}
      </p>

      {/* Shore Contact */}
      <ShoreContactBlock logistics={logistics} />

      {/* Crew Manifest */}
      <section>
        <SectionHeading icon={<UserIcon className="size-3.5" />}>
          Crew Manifest ({sortedCrew.length})
        </SectionHeading>
        <div className="flex flex-col gap-3">
          {sortedCrew.map((member) => (
            <MemberCard key={member.id ?? member.user.id} member={member} />
          ))}
        </div>
      </section>
    </div>
  )
}
