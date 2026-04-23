import { StateBadge } from "@/components/common/state-badge"
import { UserAvatar } from "@/components/common/user-avatar"
import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { TRIP_STATES } from "@/lib/dtos/trip"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Separator className="mt-2" />
      </div>
      {children}
    </section>
  )
}

function TokenSwatch({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[100px]">
      <div
        className="h-12 w-full rounded-md border border-border"
        style={{ background: `var(${variable})` }}
      />
      <p className="text-xs text-muted-foreground font-mono leading-tight">{name}</p>
      <p className="text-xs text-muted-foreground font-mono leading-tight opacity-60">{variable}</p>
    </div>
  )
}

export default function DesignPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
          <p className="text-muted-foreground mt-1">Visual reference for all theming tokens and shared components.</p>
        </div>
        <ThemeToggle />
      </div>

      {/* Breadcrumbs */}
      <Section title="Breadcrumb">
        <PageBreadcrumb crumbs={[
          { label: "Trips", href: "/trips" },
          { label: "Lofoten 2027", href: "/trips/abc" },
          { label: "Detail" },
        ]} />
      </Section>

      {/* Color tokens */}
      <Section title="Color tokens">
        <div className="flex flex-wrap gap-4">
          <TokenSwatch name="background"    variable="--background" />
          <TokenSwatch name="foreground"    variable="--foreground" />
          <TokenSwatch name="card"          variable="--card" />
          <TokenSwatch name="primary"       variable="--primary" />
          <TokenSwatch name="primary-fg"    variable="--primary-foreground" />
          <TokenSwatch name="secondary"     variable="--secondary" />
          <TokenSwatch name="muted"         variable="--muted" />
          <TokenSwatch name="muted-fg"      variable="--muted-foreground" />
          <TokenSwatch name="accent"        variable="--accent" />
          <TokenSwatch name="destructive"   variable="--destructive" />
          <TokenSwatch name="border"        variable="--border" />
        </div>
        <p className="text-sm text-muted-foreground">State colors</p>
        <div className="flex flex-wrap gap-4">
          <TokenSwatch name="draft-bg"      variable="--state-draft-bg" />
          <TokenSwatch name="draft-fg"      variable="--state-draft-fg" />
          <TokenSwatch name="planning-bg"   variable="--state-planning-bg" />
          <TokenSwatch name="planning-fg"   variable="--state-planning-fg" />
          <TokenSwatch name="happening-bg"  variable="--state-happening-bg" />
          <TokenSwatch name="happening-fg"  variable="--state-happening-fg" />
          <TokenSwatch name="past-bg"       variable="--state-past-bg" />
          <TokenSwatch name="past-fg"       variable="--state-past-fg" />
        </div>
        <p className="text-sm text-muted-foreground">Chart palette</p>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4, 5].map(n => (
            <TokenSwatch key={n} name={`chart-${n}`} variable={`--chart-${n}`} />
          ))}
        </div>
      </Section>

      {/* Typography */}
      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold">Heading 1 — Kayak Expedition</h1>
          <h2 className="text-3xl font-bold">Heading 2 — Kayak Expedition</h2>
          <h3 className="text-2xl font-semibold">Heading 3 — Kayak Expedition</h3>
          <h4 className="text-xl font-semibold">Heading 4 — Kayak Expedition</h4>
          <p className="text-base">Body — The route follows the coastline from Henningsvær to Nusfjord over six days, passing sea stacks and sheltered coves.</p>
          <p className="text-sm text-muted-foreground">Small muted — Last updated 3 days ago</p>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded-md w-fit">code — GET /api/trip/:id</code>
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="flex flex-wrap gap-3 items-center">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      {/* State badges */}
      <Section title="State badges">
        <div className="flex flex-wrap gap-3 items-center">
          {TRIP_STATES.map(state => (
            <StateBadge key={state} state={state} />
          ))}
        </div>
      </Section>

      {/* User avatars */}
      <Section title="User avatars">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex flex-col items-center gap-2">
            <UserAvatar name="Ulises" surname="Sosa" size="sm" />
            <span className="text-xs text-muted-foreground">sm</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <UserAvatar name="Ulises" surname="Sosa" size="md" />
            <span className="text-xs text-muted-foreground">md</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <UserAvatar name="Ulises" surname="Sosa" size="lg" />
            <span className="text-xs text-muted-foreground">lg</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <UserAvatar name="Carlo" size="md" />
            <span className="text-xs text-muted-foreground">no surname</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <UserAvatar
              name="Giulia"
              surname="Rossi"
              size="md"
              imageUrl="https://i.pravatar.cc/150?img=47"
            />
            <span className="text-xs text-muted-foreground">with image</span>
          </div>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Lofoten 2027</CardTitle>
              <CardDescription>Norway · 14 Jun — 28 Jun</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">A six-day sea kayak traverse of the Lofoten archipelago in midsummer.</p>
            </CardContent>
            <CardFooter className="gap-2">
              <StateBadge state="planning" />
              <span className="text-xs text-muted-foreground ml-auto">3 crew</span>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sardinia Sprint</CardTitle>
              <CardDescription>Italy · 2 Aug — 7 Aug</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Short coastal circuit around the Gulf of Orosei.</p>
            </CardContent>
            <CardFooter className="gap-2">
              <StateBadge state="draft" />
              <span className="text-xs text-muted-foreground ml-auto">solo</span>
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="flex flex-col gap-3 max-w-sm">
          <Input placeholder="Destination" />
          <Input placeholder="Disabled" disabled />
          <Input placeholder="Email" type="email" />
          <div className="flex flex-col gap-1">
            <Input placeholder="With error" className="border-destructive focus-visible:ring-destructive" />
            <p className="text-xs text-destructive">This field is required</p>
          </div>
        </div>
      </Section>
    </div>
  )
}
