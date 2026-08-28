import { AlertTriangleIcon, AnchorIcon } from "lucide-react"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { FloatPlanSnapshotSchema, type SnapshotCrewMember } from "@/lib/dtos/float-plan-snapshot"
import { API_URL, API_PREFIX } from "@/lib/api/config"
import { formatDayDate } from "@/lib/utils/date"
import { formatVesselLength } from "@/lib/user/format"
import { formatDateRange } from "@/lib/trips/format"
import { PageHeading } from "@/components/common/page-heading"
import { SectionLabel } from "@/components/common/section-label"
import { UserAvatar } from "@/components/common/user-avatar"
import { EmptyState } from "@/components/common/empty-state"

async function fetchSnapshot(token: string) {
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}/float-plan/public/${token}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const raw = await res.json()
    const parsed = FloatPlanSnapshotSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function DocRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}

// The document's section rule. The label itself is the app-wide SectionLabel —
// only the underline and spacing, which are this document's own, live here.
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <SectionLabel as="h2" className="border-border mb-4 flex items-center gap-2 border-b pb-2">
      {children}
    </SectionLabel>
  )
}

function CrewCard({ member, index }: { member: SnapshotCrewMember; index: number }) {
  const v = member.vessel
  const ec = member.emergencyContact
  const vesselDesc = [v.make, v.model].filter(Boolean).join(" ")
  const hasVessel = vesselDesc || v.lengthCm || v.colorPrimary || v.colorSecondary
  const hasEc = ec.name || ec.phone

  return (
    <div className="fp-crew-card border-border bg-card overflow-hidden rounded-md border">
      {/* Card header */}
      <div className="bg-surface-2 border-border flex items-center gap-3 border-b px-4 py-3">
        <span className="text-muted-foreground w-5 shrink-0 font-mono text-xs">
          {String(index + 1).padStart(2, "0")}
        </span>
        <UserAvatar name={member.name} size="sm" />
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{member.name}</span>
          <span className="text-primary bg-primary/10 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">
            {member.role}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="divide-border grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {/* Vessel */}
        <div className="p-4">
          <SectionLabel className="mb-3">Vessel</SectionLabel>
          {hasVessel ? (
            <div className="flex flex-col gap-1.5">
              {vesselDesc && <DocRow label="Make / model" value={vesselDesc} />}
              {v.lengthCm && <DocRow label="Length" value={formatVesselLength(v.lengthCm)} />}
              {v.colorPrimary && <DocRow label="Primary colour" value={v.colorPrimary} />}
              {v.colorSecondary && <DocRow label="Secondary colour" value={v.colorSecondary} />}
            </div>
          ) : (
            <EmptyState
              variant="inline"
              title="No vessel information provided."
              className="text-xs italic"
            />
          )}
        </div>

        {/* Emergency contact */}
        <div className="bg-surface-1 p-4">
          <SectionLabel className="mb-3">Emergency contact</SectionLabel>
          {hasEc ? (
            <div className="flex flex-col gap-1.5">
              {ec.name && <DocRow label="Name" value={ec.name} />}
              {ec.phone && <DocRow label="Phone" value={<strong>{ec.phone}</strong>} />}
              {ec.relationship && <DocRow label="Relationship" value={ec.relationship} />}
            </div>
          ) : (
            <EmptyState
              variant="inline"
              title="No emergency contact provided."
              className="text-xs italic"
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default async function PublicFloatPlanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const snap = await fetchSnapshot(token)

  if (!snap) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <AlertTriangleIcon className="text-muted-foreground size-10" />
          <PageHeading>Float plan not found</PageHeading>
          <p className="text-muted-foreground text-sm leading-relaxed">
            This link has expired or is no longer valid. Contact the expedition leader for an
            updated link.
          </p>
        </div>
      </div>
    )
  }

  const dateLabel = formatDateRange(snap.trip.dateFrom, snap.trip.dateTo)

  const sc = snap.shoreContact
  const hasShoreContact = sc && (sc.name || sc.phone || sc.email)
  const sortedCrew = [...snap.crew].sort((a, b) =>
    a.role === "leader" ? -1 : b.role === "leader" ? 1 : 0,
  )

  return (
    <div className="bg-background min-h-screen">
      {/* Header — the shared chart strip, hidden on print (the print-only
          document label below takes over there). The document kind rides in the
          nav slot, where the landing's actions sit. */}
      <ChartHeaderBar
        className="relative print:hidden"
        nav={<span className="chart-eyebrow">Float plan</span>}
      />

      {/* Print-only document label */}
      <p className="text-muted-foreground hidden px-6 pt-4 font-mono text-[10px] tracking-widest uppercase print:block">
        Float Plan — Safety Document
      </p>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        {/* Title block */}
        <div className="flex flex-col gap-4">
          <div>
            <PageHeading>{snap.trip.destination ?? "Kayak Expedition"}</PageHeading>
            <p className="text-muted-foreground mt-1 text-sm">{dateLabel}</p>
          </div>

          <div className="border-border flex flex-wrap gap-x-6 gap-y-1 border-y py-3">
            <div className="flex flex-col gap-0.5">
              <SectionLabel as="span">Crew</SectionLabel>
              <span className="text-sm font-semibold">
                {sortedCrew.length} {sortedCrew.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <SectionLabel as="span">Issued</SectionLabel>
              <span className="text-sm font-semibold">{formatDayDate(snap.generatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Safety notice */}
        <div className="flex gap-3 rounded-md border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AnchorIcon className="text-accent mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-accent text-xs font-semibold tracking-wide uppercase">
              Instructions for shore contact
            </p>
            <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
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
            <span className="bg-primary/10 text-primary inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
              {sortedCrew.length}
            </span>
          </SectionHeading>
          <div className="flex flex-col gap-3">
            {sortedCrew.map((member, i) => (
              <CrewCard key={member.mail} member={member} index={i} />
            ))}
          </div>
        </section>

        <footer className="border-border text-muted-foreground border-t pt-5 text-center text-xs leading-relaxed">
          Generated by Kayaktrek · This document contains logistical information only. Medical
          information is not included.
        </footer>
      </main>
    </div>
  )
}
