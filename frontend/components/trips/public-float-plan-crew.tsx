import type { SnapshotCrewMember } from "@/lib/dtos/float-plan-snapshot"
import { formatDayDate } from "@/lib/utils/date"
import { formatVesselLength } from "@/lib/user/format"
import { EmptyState } from "@/components/common/empty-state"
import { SectionLabel } from "@/components/common/section-label"
import { UserAvatar } from "@/components/common/user-avatar"

// Pieces of the public, shareable float plan (app/(public)/float-plan/[token]) —
// the page the shore contact reads.

export function DocRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}

export function CrewCard({ member, index }: { member: SnapshotCrewMember; index: number }) {
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

      {/* Recorded by the leader when this paddler left the trip (M9d): not someone the
          shore contact should be looking for on the water. */}
      {member.leftAt && (
        <div className="bg-destructive/10 border-border flex flex-col gap-0.5 border-b px-4 py-2">
          <span className="text-destructive text-sm font-semibold">
            {`Left the trip on ${formatDayDate(member.leftAt)}`}
          </span>
          {member.leftNote && <span className="text-sm">{member.leftNote}</span>}
        </div>
      )}

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
