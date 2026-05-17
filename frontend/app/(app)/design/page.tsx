import { StateVisual } from "@/components/illustrations/state-visual"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { TripCard } from "@/components/common/trip-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { WindIcon, WavesIcon, MapPinIcon, UsersIcon, RadioIcon } from "lucide-react"
import { TRIP_STATES, TRIP_STATE_LABELS, type Trip } from "@/lib/dtos/trip"

// ── helpers ──────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        <Separator className="mt-2" />
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{children}</p>
}

// ── mock data ─────────────────────────────────────────────────────────────────

const MOCK_TRIPS: Trip[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000001",
    destination: "Lofoten Archipelago",
    state: "happening",
    dateFrom: "2026-06-14",
    dateTo: "2026-06-28",
    travellers: [
      { id: "01952f1a-0000-7000-8000-000000000011", role: "leader", user: { id: "01952f1a-0000-7000-8000-000000000021", mail: "u@example.com", username: "ulises", name: "Ulises", surname: "Sosa", phone: "+34600000001" } },
      { id: "01952f1a-0000-7000-8000-000000000012", role: "crew",   user: { id: "01952f1a-0000-7000-8000-000000000022", mail: "c@example.com", username: "carlo",  name: "Carlo",  phone: "+39600000002" } },
      { id: "01952f1a-0000-7000-8000-000000000013", role: "crew",   user: { id: "01952f1a-0000-7000-8000-000000000023", mail: "g@example.com", username: "giulia", name: "Giulia", surname: "Rossi", phone: "+39600000003" } },
    ],
  },
  {
    id: "01952f1a-0000-7000-8000-000000000002",
    destination: "Sardinia — Gulf of Orosei",
    state: "building",
    dateFrom: "2026-08-02",
    dateTo: "2026-08-07",
    travellers: [
      { id: "01952f1a-0000-7000-8000-000000000014", role: "leader", user: { id: "01952f1a-0000-7000-8000-000000000021", mail: "u@example.com", username: "ulises", name: "Ulises", surname: "Sosa", phone: "+34600000001" } },
    ],
  },
  {
    id: "01952f1a-0000-7000-8000-000000000003",
    destination: "Costa Brava Circuit",
    state: "building",
    travellers: [],
  },
  {
    id: "01952f1a-0000-7000-8000-000000000004",
    destination: "Azores Crossing",
    state: "past",
    dateFrom: "2025-09-01",
    dateTo: "2025-09-12",
    travellers: [
      { id: "01952f1a-0000-7000-8000-000000000015", role: "leader", user: { id: "01952f1a-0000-7000-8000-000000000021", mail: "u@example.com", username: "ulises", name: "Ulises", surname: "Sosa", phone: "+34600000001" } },
      { id: "01952f1a-0000-7000-8000-000000000016", role: "crew",   user: { id: "01952f1a-0000-7000-8000-000000000022", mail: "c@example.com", username: "carlo",  name: "Carlo",  phone: "+39600000002" } },
    ],
  },
]

// ── page ──────────────────────────────────────────────────────────────────────

export default function DesignPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-14">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.01em]">Design Lab</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Component and token showcase. Toggle light / dark to verify both modes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
        </div>
      </div>

      {/* ── 1. Trip list ─────────────────────────────────────────────────────── */}
      <Section title="1 — Trip list" subtitle="Real TripCard component. All four states. Hover a card to see lift.">
        <div className="flex flex-col gap-3">
          {MOCK_TRIPS.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      </Section>

      {/* ── 2. Live expedition panel ─────────────────────────────────────────── */}
      <Section title="2 — Live expedition panel" subtitle="What the active trip card looks like mid-paddle.">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Active expedition</p>
                <CardTitle className="text-lg tracking-[-0.01em]">Lofoten Archipelago</CardTitle>
              </div>
              <StateBadge state="happening" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">

            {/* Progress */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Day 3 of 14</span>
                <span className="text-muted-foreground font-mono text-xs">21%</span>
              </div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full w-[21%] rounded-full bg-[var(--foam)]" />
              </div>
            </div>

            {/* Conditions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 p-3 rounded-md bg-[var(--surface-3,var(--muted))]">
                <Label>Wind</Label>
                <p className="font-mono text-sm font-medium">12 kn NW</p>
              </div>
              <div className="flex flex-col gap-0.5 p-3 rounded-md bg-[var(--surface-3,var(--muted))]">
                <Label>Swell</Label>
                <p className="font-mono text-sm font-medium">0.8 m · 7 s</p>
              </div>
              <div className="flex flex-col gap-0.5 p-3 rounded-md bg-[var(--surface-3,var(--muted))]">
                <Label>Position</Label>
                <p className="font-mono text-sm font-medium">68°14′N 14°30′E</p>
              </div>
              <div className="flex flex-col gap-0.5 p-3 rounded-md bg-[var(--surface-3,var(--muted))]">
                <Label>Next stop</Label>
                <p className="text-sm font-medium">Nusfjord · 8 km</p>
              </div>
            </div>

            {/* Crew + action */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {MOCK_TRIPS[0].travellers?.map((m) => (
                    <UserAvatar key={m.id} name={m.user.name} surname={m.user.surname} size="sm" className="ring-2 ring-background" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">3 crew</span>
              </div>
              <Button size="sm" className="bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90 gap-1.5">
                <RadioIcon className="size-3.5" />
                Live tracking
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* ── 3. Primary actions ───────────────────────────────────────────────── */}
      <Section title="3 — Button semantics" subtitle="Each role has one colour. No exceptions.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>CTA — sunset accent</Label>
            <div className="flex gap-2">
              <Button className="bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90">
                Start expedition
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Live / motion — foam</Label>
            <div className="flex gap-2">
              <Button className="bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90">
                Track live
              </Button>
              <Button className="bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90" size="sm">
                Share position
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Structure — primary</Label>
            <div className="flex gap-2">
              <Button>Invite crew</Button>
              <Button variant="outline">View route</Button>
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Back</Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destructive</Label>
            <div className="flex gap-2">
              <Button variant="destructive">Leave trip</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 4. State system ──────────────────────────────────────────────────── */}
      <Section title="4 — Trip states">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRIP_STATES.map((state) => {
            const meta: Record<typeof state, { desc: string; icon: React.ElementType }> = {
              building:  { desc: "Crew invited, logistics underway.",         icon: UsersIcon },
              happening: { desc: "Expedition is live. Crew on water.",         icon: RadioIcon },
              past:      { desc: "Trip completed. Logs and photos archived.",  icon: WavesIcon },
            }
            const { desc, icon: Icon } = meta[state]
            return (
              <div key={state} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-[var(--surface-2,var(--muted))]">
                <Icon className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-1">
                  <StateBadge state={state} />
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 5. Surface layers ────────────────────────────────────────────────── */}
      <Section title="5 — Surface depth" subtitle="Three levels create water-depth layering.">
        <div className="flex flex-col gap-2 rounded-xl border border-border p-2 bg-background">
          <p className="text-xs text-muted-foreground px-2 pt-1">background</p>
          <div className="rounded-lg border border-border p-2 bg-[var(--surface-3,var(--muted))]">
            <p className="text-xs text-muted-foreground px-2 pb-1">surface-3 — inset panels</p>
            <div className="rounded-md border border-border p-2 bg-[var(--surface-2,var(--secondary))]">
              <p className="text-xs text-muted-foreground px-2 pb-1">surface-2 — mid layer</p>
              <div className="rounded-md border border-border p-4 bg-[var(--surface-1,var(--card))] flex items-center justify-between">
                <span className="text-xs text-muted-foreground">surface-1 — card / top</span>
                <StateBadge state="building" />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 6. Foam color ────────────────────────────────────────────────────── */}
      <Section title="6 — Foam color" subtitle="Live / motion signal color.">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[var(--foam)] shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">--foam</span>
              <span className="text-xs text-muted-foreground font-mono">oklch(0.66 0.14 185) in V2</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-[var(--foam-soft,var(--secondary))] overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-[var(--foam)]" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90">
              <RadioIcon className="size-3.5" /> Live
            </Button>
            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-[var(--foam-soft,var(--secondary))] text-[var(--foam)]">
              ● On route
            </span>
          </div>
        </div>
      </Section>

      {/* ── 8. State visuals ─────────────────────────────────────────────────── */}
      <Section
        title="8 — State visuals"
        subtitle="Domain-anchored grammar: compass · waypoints · route · paddle · horizon. All five states — toggle dark mode to verify both themes."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(["empty", "loading", "not-found", "error", "success"] as const).map((state) => {
            const meta = {
              empty:     { label: "Empty",       desc: "Paddle ready — no voyages yet."        },
              loading:   { label: "Loading",     desc: "Navigating toward something."           },
              "not-found": { label: "404",        desc: "Destination doesn't exist."            },
              error:     { label: "500",         desc: "Lost bearing — system failure."         },
              success:   { label: "Success",     desc: "Route resolved. Flag planted."          },
            }[state]
            return (
              <div key={state} className="flex flex-col gap-2 rounded-xl border border-border p-3 bg-[var(--surface-2,var(--muted))]">
                <StateVisual state={state} className="rounded-lg overflow-hidden" />
                <div className="flex flex-col gap-0.5 px-1 pb-1">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 7. Typography ────────────────────────────────────────────────────── */}
      <Section title="7 — Typography hierarchy">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold tracking-[-0.01em]">Route: Henningsvær → Nusfjord</h1>
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">Day 3 — Kabelvåg to Svolvær</h2>
          <p className="text-base">The route follows the outer coast, exposed to NW swell. Conditions moderate. Estimated paddle time 4–5 hours including breaks at the sea stacks.</p>
          <p className="text-sm text-muted-foreground">Last synced 8 minutes ago · 3 crew active</p>
          <div className="flex flex-wrap gap-4 pt-1">
            <div className="flex flex-col gap-0.5">
              <Label>Coordinates</Label>
              <span className="font-mono text-sm">68°14′12″N  14°29′47″E</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label>Wind</Label>
              <span className="font-mono text-sm">12 kn · 315°</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label>Distance today</Label>
              <span className="font-mono text-sm">18.4 km</span>
            </div>
          </div>
        </div>
      </Section>

    </div>
  )
}
