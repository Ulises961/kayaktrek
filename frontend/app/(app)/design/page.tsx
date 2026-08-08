import { notFound } from "next/navigation"
import { StateVisual } from "@/components/illustrations/state-visual"
import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { TripCard } from "@/components/common/trip-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { WavesIcon, UsersIcon, RadioIcon } from "lucide-react"
import { TRIP_STATES, type Trip } from "@/lib/dtos/trip"
import { formatRouteRange } from "@/lib/itinerary/format"
import { TestEmailButton } from "@/components/profile/test-email-button"
import { ItineraryLayoutWireframe } from "@/components/wireframes/itinerary-layout-wireframe"
import { CompassRose } from "@/components/landing/compass-rose"
import {
  Cartouche,
  CartoucheEyebrow,
  CartoucheTitle,
  CartoucheRule,
  CartoucheNote,
  NeatLine,
} from "@/components/landing/cartouche"

// ── helpers ──────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="text-muted-foreground mt-0.5 text-sm">{subtitle}</p>}
        <Separator className="mt-2" />
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{children}</p>
  )
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
      {
        id: "01952f1a-0000-7000-8000-000000000011",
        role: "leader",
        user: {
          id: "01952f1a-0000-7000-8000-000000000021",
          mail: "u@example.com",
          username: "ulises",
          name: "Ulises",
          surname: "Sosa",
          phone: "+34600000001",
        },
      },
      {
        id: "01952f1a-0000-7000-8000-000000000012",
        role: "crew",
        user: {
          id: "01952f1a-0000-7000-8000-000000000022",
          mail: "c@example.com",
          username: "carlo",
          name: "Carlo",
          phone: "+39600000002",
        },
      },
      {
        id: "01952f1a-0000-7000-8000-000000000013",
        role: "crew",
        user: {
          id: "01952f1a-0000-7000-8000-000000000023",
          mail: "g@example.com",
          username: "giulia",
          name: "Giulia",
          surname: "Rossi",
          phone: "+39600000003",
        },
      },
    ],
  },
  {
    id: "01952f1a-0000-7000-8000-000000000002",
    destination: "Sardinia — Gulf of Orosei",
    state: "building",
    dateFrom: "2026-08-02",
    dateTo: "2026-08-07",
    travellers: [
      {
        id: "01952f1a-0000-7000-8000-000000000014",
        role: "leader",
        user: {
          id: "01952f1a-0000-7000-8000-000000000021",
          mail: "u@example.com",
          username: "ulises",
          name: "Ulises",
          surname: "Sosa",
          phone: "+34600000001",
        },
      },
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
      {
        id: "01952f1a-0000-7000-8000-000000000015",
        role: "leader",
        user: {
          id: "01952f1a-0000-7000-8000-000000000021",
          mail: "u@example.com",
          username: "ulises",
          name: "Ulises",
          surname: "Sosa",
          phone: "+34600000001",
        },
      },
      {
        id: "01952f1a-0000-7000-8000-000000000016",
        role: "crew",
        user: {
          id: "01952f1a-0000-7000-8000-000000000022",
          mail: "c@example.com",
          username: "carlo",
          name: "Carlo",
          phone: "+39600000002",
        },
      },
    ],
  },
]

// ── page ──────────────────────────────────────────────────────────────────────

export default function DesignPage() {
  // Component/token showcase — dev-only, never ship it in the production bundle.
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-14 px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.01em]">Design Lab</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Component and token showcase. Toggle light / dark to verify both modes.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* ── 1. Trip list ─────────────────────────────────────────────────────── */}
      <Section
        title="1 — Trip list"
        subtitle="Real TripCard component. All four states. Hover a card to see lift."
      >
        <div className="flex flex-col gap-3">
          {MOCK_TRIPS.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      </Section>

      {/* ── 2. Live expedition panel ─────────────────────────────────────────── */}
      <Section
        title="2 — Live expedition panel"
        subtitle="What the active trip card looks like mid-paddle."
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  Active expedition
                </p>
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
              <div className="bg-border h-1.5 overflow-hidden rounded-full">
                <div className="h-full w-[21%] rounded-full bg-[var(--foam)]" />
              </div>
            </div>

            {/* Conditions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 rounded-md bg-[var(--surface-3,var(--muted))] p-3">
                <Label>Wind</Label>
                <p className="font-mono text-sm font-medium">12 kn NW</p>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-[var(--surface-3,var(--muted))] p-3">
                <Label>Swell</Label>
                <p className="font-mono text-sm font-medium">0.8 m · 7 s</p>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-[var(--surface-3,var(--muted))] p-3">
                <Label>Position</Label>
                <p className="font-mono text-sm font-medium">68°14′N 14°30′E</p>
              </div>
              <div className="flex flex-col gap-0.5 rounded-md bg-[var(--surface-3,var(--muted))] p-3">
                <Label>Next stop</Label>
                <p className="text-sm font-medium">Nusfjord · 8 km</p>
              </div>
            </div>

            {/* Crew + action */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {MOCK_TRIPS[0].travellers?.map((m) => (
                    <UserAvatar
                      key={m.id}
                      name={m.user.name}
                      surname={m.user.surname}
                      size="sm"
                      className="ring-background ring-2"
                    />
                  ))}
                </div>
                <span className="text-muted-foreground text-sm">3 crew</span>
              </div>
              <Button
                size="sm"
                className="gap-1.5 bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90"
              >
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
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Back
              </Button>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TRIP_STATES.map((state) => {
            const meta: Record<typeof state, { desc: string; icon: React.ElementType }> = {
              building: { desc: "Crew invited, logistics underway.", icon: UsersIcon },
              happening: { desc: "Expedition is live. Crew on water.", icon: RadioIcon },
              past: { desc: "Trip completed. Logs and photos archived.", icon: WavesIcon },
            }
            const { desc, icon: Icon } = meta[state]
            return (
              <div
                key={state}
                className="border-border flex items-start gap-3 rounded-lg border bg-[var(--surface-2,var(--muted))] p-4"
              >
                <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="flex flex-col gap-1">
                  <StateBadge state={state} />
                  <p className="text-muted-foreground mt-1 text-xs">{desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 5. Surface layers ────────────────────────────────────────────────── */}
      <Section title="5 — Surface depth" subtitle="Three levels create water-depth layering.">
        <div className="border-border bg-background flex flex-col gap-2 rounded-xl border p-2">
          <p className="text-muted-foreground px-2 pt-1 text-xs">background</p>
          <div className="border-border rounded-lg border bg-[var(--surface-3,var(--muted))] p-2">
            <p className="text-muted-foreground px-2 pb-1 text-xs">surface-3 — inset panels</p>
            <div className="border-border rounded-md border bg-[var(--surface-2,var(--secondary))] p-2">
              <p className="text-muted-foreground px-2 pb-1 text-xs">surface-2 — mid layer</p>
              <div className="border-border flex items-center justify-between rounded-md border bg-[var(--surface-1,var(--card))] p-4">
                <span className="text-muted-foreground text-xs">surface-1 — card / top</span>
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
            <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--foam)]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">--foam</span>
              <span className="text-muted-foreground font-mono text-xs">
                oklch(0.66 0.14 185) in V2
              </span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--foam-soft,var(--secondary))]">
            <div className="h-full w-2/3 rounded-full bg-[var(--foam)]" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-[var(--foam)] text-white hover:bg-[var(--foam)]/90">
              <RadioIcon className="size-3.5" /> Live
            </Button>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--foam-soft,var(--secondary))] px-3 py-1 text-xs font-medium text-[var(--foam)]">
              ● On route
            </span>
          </div>
        </div>
      </Section>

      {/* ── 8. State visuals ─────────────────────────────────────────────────── */}
      <Section
        title="8 — State visuals"
        subtitle="Two grammars. Empty/loading/success are seascapes: compass · waypoints · route · paddle · horizon. 404/500 are the Reinel chart rose, true or adrift — a broken page is not an unfinished route. Toggle dark mode to verify both themes."
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(["empty", "loading", "not-found", "error", "success"] as const).map((state) => {
            const meta = {
              empty: { label: "Empty", desc: "Paddle ready — no voyages yet." },
              loading: { label: "Loading", desc: "Navigating toward something." },
              "not-found": { label: "404", desc: "Rose true. Destination doesn't exist." },
              error: { label: "500", desc: "Rose adrift — hunting for north." },
              success: { label: "Success", desc: "Route resolved. Flag planted." },
            }[state]
            return (
              <div
                key={state}
                className="border-border flex flex-col gap-2 rounded-xl border bg-[var(--surface-2,var(--muted))] p-3"
              >
                <StateVisual state={state} className="overflow-hidden rounded-lg" />
                <div className="flex flex-col gap-0.5 px-1 pb-1">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <p className="text-muted-foreground text-xs">{meta.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 9. Itinerary layout wireframe ────────────────────────────────────── */}
      <Section
        title="9 — Itinerary layout wireframe"
        subtitle="Day strip, then feature drawer, then bottom sheet. Click a day, switch tabs, then click a route point."
      >
        <ItineraryLayoutWireframe />
      </Section>

      {/* ── Dev tools ────────────────────────────────────────────────────────── */}
      <Section
        title="Dev tools"
        subtitle="Only visible in development — backend returns 404 in production."
      >
        <div className="flex flex-col gap-2">
          <Label>SMTP</Label>
          <TestEmailButton />
        </div>
      </Section>

      {/* ── 7. Typography ────────────────────────────────────────────────────── */}
      <Section title="7 — Typography hierarchy">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold tracking-[-0.01em]">
            Route: {formatRouteRange("Henningsvær", "Nusfjord")}
          </h1>
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">Day 3 — Kabelvåg to Svolvær</h2>
          <p className="text-base">
            The route follows the outer coast, exposed to NW swell. Conditions moderate. Estimated
            paddle time 4–5 hours including breaks at the sea stacks.
          </p>
          <p className="text-muted-foreground text-sm">Last synced 8 minutes ago · 3 crew active</p>
          <div className="flex flex-wrap gap-4 pt-1">
            <div className="flex flex-col gap-0.5">
              <Label>Coordinates</Label>
              <span className="font-mono text-sm">68°14′12″N 14°29′47″E</span>
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

      <Section
        title="8 — Nautical chart (landing)"
        subtitle="The landing's chart language, promoted into the DS. Shown over a deep-sea panel as it appears on the map. Map overlays (graticule, scale bar, forecast cell) are Leaflet furniture in components/map/chart/."
      >
        <div className="flex flex-col gap-3">
          <Label>Cartouche · neat-line · compass rose</Label>
          {/* Deep-sea backdrop so the chart-paper ivory reads as it does on the map. */}
          <div className="relative h-80 overflow-hidden rounded-md bg-[oklch(0.2_0.05_245)]">
            <NeatLine />
            <div className="absolute top-4 left-4">
              <CompassRose size={40} />
            </div>
            <div className="absolute bottom-6 left-6 w-[min(24rem,calc(100%-3rem))]">
              <Cartouche className="p-6">
                <CartoucheEyebrow>Sea-kayak expedition planning</CartoucheEyebrow>
                <CartoucheTitle className="mt-3 text-[2rem]">
                  Plan the passage.
                  <br />
                  <em>Paddle it with your crew.</em>
                </CartoucheTitle>
                <CartoucheRule className="mt-4" />
                <CartoucheNote className="mt-4">
                  A growing chart of paddled waters — add the one you know best.
                </CartoucheNote>
              </Cartouche>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
