import { notFound } from "next/navigation"
import Link from "next/link"
import { getPublicProfile } from "@/lib/public-profile/actions"
import { getSession } from "@/lib/auth/session"
import { getMe } from "@/lib/user/me"
import { isCertExpired } from "@/lib/certifications/expiry"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { UserAvatar } from "@/components/common/user-avatar"
import { ListRow } from "@/components/common/list-row"
import { ProfileRelationshipControls } from "@/components/paddlers/profile-relationship-controls"
import { StatsDashboard } from "@/components/stats/stats-dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AwardIcon, MapPinIcon, ActivityIcon, AnchorIcon } from "lucide-react"

interface PublicProfilePageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PublicProfilePageProps) {
  const { username } = await params
  const profile = await getPublicProfile(username)
  if (!profile) return { title: "Paddler not found" }
  const fullName = [profile.name, profile.surname].filter(Boolean).join(" ")
  return {
    title: `${fullName} (@${profile.username}) — Paddler`,
    description: profile.bio ?? undefined,
  }
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params
  const [profile, session] = await Promise.all([getPublicProfile(username), getSession()])
  if (!profile) notFound()

  // The viewer's own unit preference, not the profile owner's — an anonymous
  // visitor (no session) sees the app-wide default.
  const viewer = session ? await getMe() : null
  const viewerUnit = viewer?.unitPreference ?? DISTANCE_UNIT.NM

  const fullName = [profile.name, profile.surname].filter(Boolean).join(" ")

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        {/* Brand */}
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
        >
          <AnchorIcon className="size-4" />
          Kayak Expedition Planner
        </Link>

        {/* Header */}
        <div className="flex items-start gap-5">
          <UserAvatar
            name={profile.name}
            surname={profile.surname}
            imageUrl={profile.avatarUrl}
            size="lg"
            className="!size-16"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold">{fullName}</h1>
            <p className="text-muted-foreground text-sm">@{profile.username}</p>
            {profile.homeLocation && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <MapPinIcon className="size-3.5 shrink-0" />
                {profile.homeLocation}
              </p>
            )}
          </div>
          {session && <ProfileRelationshipControls username={profile.username} />}
        </div>

        {profile.bio && <p className="text-sm whitespace-pre-line">{profile.bio}</p>}

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivityIcon className="size-4" />
              Paddling stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatsDashboard stats={profile.stats} unit={viewerUnit} />
          </CardContent>
        </Card>

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AwardIcon className="size-4" />
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {profile.certifications.map((cert, i) => {
                  const expired = isCertExpired(cert.validUntil)
                  return (
                    <ListRow
                      key={`${cert.organization}-${cert.award}-${i}`}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <AwardIcon className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{cert.award}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {cert.organization}
                        </p>
                      </div>
                      {expired && (
                        <span className="rounded-[3px] border border-current bg-red-100 px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-red-700 uppercase dark:bg-red-900/30 dark:text-red-400">
                          Expired
                        </span>
                      )}
                    </ListRow>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
