import { AlertTriangleIcon, AnchorIcon } from "lucide-react"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { FloatPlanSnapshotSchema } from "@/lib/dtos/float-plan-snapshot"
import { API_URL, API_PREFIX } from "@/lib/api/config"
import { formatDayDate } from "@/lib/utils/date"
import { formatDateRange } from "@/lib/trips/format"
import { PageHeading } from "@/components/common/page-heading"
import { SectionLabel } from "@/components/common/section-label"
import { CrewCard, DocRow } from "@/components/trips/public-float-plan-crew"
import { UNLISTED } from "@/lib/seo/robots"

// See lib/seo/robots.ts. A float plan carries crew names and emergency contacts; robots.txt
// asks crawlers not to fetch it, this stops anything that did from indexing it. Belt and
// braces: these links are pasted into WhatsApp/email, and a link-preview fetcher does not
// read robots.txt, so this metadata is the only thing that reaches it.
export const metadata = UNLISTED

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

// The document's section rule. The label itself is the app-wide SectionLabel —
// only the underline and spacing, which are this document's own, live here.
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <SectionLabel as="h2" className="border-border mb-4 flex items-center gap-2 border-b pb-2">
      {children}
    </SectionLabel>
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
