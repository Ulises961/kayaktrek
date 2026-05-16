import { format } from "date-fns"
import { AlertTriangleIcon, AnchorIcon, ShipWheelIcon, UserIcon } from "lucide-react"
import { FloatPlanSnapshotSchema, type SnapshotCrewMember } from "@/lib/dtos/float-plan-snapshot"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"

async function fetchSnapshot(token: string) {
  try {
    const res = await fetch(`${API_URL}/api/float-plan/public/${token}`, { cache: "no-store" })
    if (!res.ok) return null
    const raw = await res.json()
    const parsed = FloatPlanSnapshotSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  try { return format(new Date(iso), "d MMM yyyy") } catch { return iso }
}

function formatLength(cm: number | null | undefined) {
  if (cm == null) return null
  return `${(cm / 100).toFixed(2)} m`
}

function DocRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground border-b border-border pb-2 mb-4 flex items-center gap-2">
      {children}
    </h2>
  )
}

function CrewCard({ member, index }: { member: SnapshotCrewMember; index: number }) {
  const v = member.vessel
  const ec = member.emergencyContact
  const vesselDesc = [v.make, v.model].filter(Boolean).join(" ")
  const hasVessel = vesselDesc || v.lengthCm || v.colorPrimary || v.colorSecondary
  const hasEc = ec.name || ec.phone

  return (
    <div className="fp-crew-card rounded-md border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-border">
        <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>
        <UserIcon className="size-3.5 text-muted-foreground shrink-0" />
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold">{member.name}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {member.role}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {/* Vessel */}
        <div className="p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Vessel
          </p>
          {hasVessel ? (
            <div className="flex flex-col gap-1.5">
              {vesselDesc && <DocRow label="Make / model" value={vesselDesc} />}
              {v.lengthCm && <DocRow label="Length" value={formatLength(v.lengthCm)} />}
              {v.colorPrimary && <DocRow label="Primary colour" value={v.colorPrimary} />}
              {v.colorSecondary && <DocRow label="Secondary colour" value={v.colorSecondary} />}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No vessel information provided.</p>
          )}
        </div>

        {/* Emergency contact */}
        <div className="p-4 bg-surface-1">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Emergency Contact
          </p>
          {hasEc ? (
            <div className="flex flex-col gap-1.5">
              {ec.name && <DocRow label="Name" value={ec.name} />}
              {ec.phone && <DocRow label="Phone" value={<strong>{ec.phone}</strong>} />}
              {ec.relationship && <DocRow label="Relationship" value={ec.relationship} />}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No emergency contact provided.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function PublicFloatPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const snap = await fetchSnapshot(token)

  if (!snap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-4">
          <AlertTriangleIcon className="size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Float plan not found</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This link has expired or is no longer valid. Contact the expedition leader for an updated link.
          </p>
        </div>
      </div>
    )
  }

  const dateRange = [snap.trip.dateFrom, snap.trip.dateTo].filter(Boolean)
  const dateLabel =
    dateRange.length === 2
      ? `${formatDate(dateRange[0])} – ${formatDate(dateRange[1])}`
      : dateRange.length === 1
      ? formatDate(dateRange[0])
      : "Dates not set"

  const sc = snap.shoreContact
  const hasShoreContact = sc && (sc.name || sc.phone || sc.email)
  const sortedCrew = [...snap.crew].sort((a, b) => (a.role === "leader" ? -1 : b.role === "leader" ? 1 : 0))

  return (
    <div className="min-h-screen bg-background">
      {/* Header — hidden on print */}
      <header className="border-b border-border bg-card px-6 py-3.5 flex items-center gap-2 print:hidden">
        <ShipWheelIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold tracking-tight text-primary">Kayak Planner</span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Float Plan
        </span>
      </header>

      {/* Print-only document label */}
      <p className="hidden print:block font-mono text-[10px] uppercase tracking-widest text-muted-foreground px-6 pt-4">
        Float Plan — Safety Document
      </p>

      <main className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Title block */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-primary" style={{ fontFamily: "var(--font-display)" }}>
              {snap.trip.destination ?? "Kayak Expedition"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{dateLabel}</p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-y border-border py-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Crew</span>
              <span className="text-sm font-semibold">{sortedCrew.length} {sortedCrew.length === 1 ? "person" : "people"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Issued</span>
              <span className="text-sm font-semibold">{formatDate(snap.generatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Safety notice */}
        <div className="flex gap-3 rounded-md border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
          <AnchorIcon className="size-4 text-accent shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Instructions for shore contact
            </p>
            <p className="text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              If the expedition party has not returned or made contact by the expected return date
              and you are unable to reach them, contact the relevant local emergency services and
              provide the vessel descriptions and emergency contacts listed in this document.
            </p>
          </div>
        </div>

        {/* Shore contact */}
        {hasShoreContact && (
          <section>
            <SectionHeading>Shore Contact</SectionHeading>
            <div className="flex flex-col gap-1.5">
              {sc?.name && <DocRow label="Name" value={sc.name} />}
              {sc?.phone && <DocRow label="Phone" value={<strong>{sc.phone}</strong>} />}
              {sc?.email && <DocRow label="Email" value={sc.email} />}
              {sc?.relationship && <DocRow label="Relationship" value={sc.relationship} />}
            </div>
          </section>
        )}

        {/* Crew manifest */}
        <section>
          <SectionHeading>
            Crew Manifest
            <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
              {sortedCrew.length}
            </span>
          </SectionHeading>
          <div className="flex flex-col gap-3">
            {sortedCrew.map((member, i) => (
              <CrewCard key={member.mail} member={member} index={i} />
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-5 text-xs text-muted-foreground text-center leading-relaxed">
          Generated by Kayak Planner · This document contains logistical information only. Medical information is not included.
        </footer>
      </main>
    </div>
  )
}
