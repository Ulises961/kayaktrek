import { notFound } from "next/navigation"
import Link from "next/link"
import { apiGet, rethrowUnlessClientError } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { MedicalNotesSection } from "@/components/profile/medical-notes-section"
import { MEDICAL_NOTES_ENABLED } from "@/lib/features"
import { PublicProfileToggle } from "@/components/profile/public-profile-toggle"
import { CertificationsSection } from "@/components/profile/certifications-section"
import { StatsDashboard } from "@/components/stats/stats-dashboard"
import { getMyStats } from "@/lib/logs/actions"
import { PageHeading } from "@/components/common/page-heading"
import {
  PhoneIcon,
  PencilIcon,
  AnchorIcon,
  ShieldAlertIcon,
  HeartPulseIcon,
  RulerIcon,
  PaletteIcon,
  MapPinIcon,
  GlobeIcon,
  AwardIcon,
  ActivityIcon,
} from "lucide-react"

export default async function ProfilePage() {
  let user
  try {
    const raw = await apiGet("/api/user/me")
    user = UserSchema.parse(raw)
  } catch (error) {
    rethrowUnlessClientError(error)
    notFound()
  }

  const stats = await getMyStats().catch(() => null)

  const hasVessel =
    user.vesselMake || user.vesselModel || user.vesselLengthCm || user.vesselColorPrimary
  const hasEmergency = user.emergencyContactName || user.emergencyContactPhone

  return (
    <>
      {user.bannerUrl && (
        <div className="bg-muted h-32 w-full overflow-hidden rounded-lg sm:h-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.bannerUrl} alt="" className="size-full object-cover" />
        </div>
      )}

      {/* Header */}
      {/* The avatar sits above the identity block at base and beside it from sm. At 320 the
          72px avatar, its gap and the edit button leave the name, handle and contact lines
          about 84px between them — a column too narrow for any of them. */}
      <div className="flex items-start gap-3 sm:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
          <UserAvatar
            name={user.name}
            surname={user.surname}
            imageUrl={user.avatarUrl}
            size="lg"
            className="!size-16 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <PageHeading className="truncate">
              {[user.name, user.surname].filter(Boolean).join(" ")}
            </PageHeading>
            <p className="text-muted-foreground text-sm">@{user.username}</p>
            {user.homeLocation && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <MapPinIcon className="size-3.5 shrink-0" />
                {user.homeLocation}
              </p>
            )}
            {user.phone && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <PhoneIcon className="size-3.5 shrink-0" />
                {user.phone}
              </p>
            )}
            {user.bio && <p className="mt-2 text-sm whitespace-pre-line">{user.bio}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* Icon alone at base, where the label costs room the name and contact lines
              need; `sr-only` rather than `hidden` keeps the control named at every width,
              and the explicit aria-label makes that name independent of how the
              accessible-name algorithm joins the icon and the span. */}
          <Button asChild variant="outline" size="sm" aria-label="Edit profile">
            <Link href="/profile/edit">
              <PencilIcon className="size-4" />
              <span className="sr-only sm:not-sr-only">Edit profile</span>
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Who I am */}
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Who I am
        </p>

        {stats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon className="size-4" />
                Paddling stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatsDashboard stats={stats} unit={user.unitPreference} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AwardIcon className="size-4" />
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CertificationsSection initialCerts={user.certifications ?? []} />
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Safety data */}
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Safety data
        </p>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AnchorIcon className="size-4" />
              Vessel defaults
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasVessel ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {user.vesselMake && (
                  <>
                    <dt className="text-muted-foreground">Make</dt>
                    <dd>{user.vesselMake}</dd>
                  </>
                )}
                {user.vesselModel && (
                  <>
                    <dt className="text-muted-foreground">Model</dt>
                    <dd>{user.vesselModel}</dd>
                  </>
                )}
                {user.vesselLengthCm && (
                  <>
                    <dt className="text-muted-foreground flex items-center gap-1">
                      <RulerIcon className="size-3" /> Length
                    </dt>
                    <dd>{user.vesselLengthCm} cm</dd>
                  </>
                )}
                {(user.vesselColorPrimary || user.vesselColorSecondary) && (
                  <>
                    <dt className="text-muted-foreground flex items-center gap-1">
                      <PaletteIcon className="size-3" /> Colours
                    </dt>
                    <dd>
                      {[user.vesselColorPrimary, user.vesselColorSecondary]
                        .filter(Boolean)
                        .join(" / ")}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                No vessel details yet.{" "}
                <Link
                  href="/profile/edit"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  Add them
                </Link>{" "}
                to pre-fill float plans when you join trips.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4" />
              Emergency contact
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasEmergency ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {user.emergencyContactName && (
                  <>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>{user.emergencyContactName}</dd>
                  </>
                )}
                {user.emergencyContactRelationship && (
                  <>
                    <dt className="text-muted-foreground">Relationship</dt>
                    <dd>{user.emergencyContactRelationship}</dd>
                  </>
                )}
                {user.emergencyContactPhone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{user.emergencyContactPhone}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                No emergency contact yet.{" "}
                <Link
                  href="/profile/edit"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  Add one
                </Link>{" "}
                — it will be included in your float plans.
              </p>
            )}
          </CardContent>
        </Card>

        {MEDICAL_NOTES_ENABLED && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulseIcon className="size-4" />
                Medical notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MedicalNotesSection
                hasStoredNotes={!!user.medicalNotesConsentAt}
                resetAt={user.medicalNotesResetAt}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Community presence */}
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Community presence
        </p>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GlobeIcon className="size-4" />
              Public profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PublicProfileToggle
              username={user.username}
              initialIsPublic={!!user.profileIsPublic}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
