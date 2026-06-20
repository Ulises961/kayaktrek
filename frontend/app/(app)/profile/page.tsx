import { notFound } from "next/navigation"
import Link from "next/link"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { UserAvatar } from "@/components/common/user-avatar"
import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DeleteAccountButton } from "@/components/profile/delete-account-button"
import { DataExportButton } from "@/components/profile/data-export-button"
import { MedicalNotesSection } from "@/components/profile/medical-notes-section"
import {
  MailIcon,
  PhoneIcon,
  PencilIcon,
  AnchorIcon,
  ShieldAlertIcon,
  HeartPulseIcon,
  RulerIcon,
  PaletteIcon,
  UserIcon,
  LockIcon,
} from "lucide-react"

export default async function ProfilePage() {
  let user
  try {
    const raw = await apiGet("/api/user/me")
    user = UserSchema.parse(raw)
  } catch {
    notFound()
  }

  const hasVessel =
    user.vesselMake || user.vesselModel || user.vesselLengthCm || user.vesselColorPrimary
  const hasEmergency = user.emergencyContactName || user.emergencyContactPhone

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageBreadcrumb crumbs={[{ label: "Profile" }]} />

      {/* Header */}
      <div className="flex items-start gap-5">
        <UserAvatar
          name={user.name}
          surname={user.surname}
          imageUrl={user.avatarUrl}
          size="lg"
          className="!size-16"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">
            {[user.name, user.surname].filter(Boolean).join(" ")}
          </h1>
          <p className="text-muted-foreground text-sm">@{user.username}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/edit">
              <PencilIcon className="size-4" />
              Edit profile
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/profile/change-password">
              <LockIcon className="size-4" />
              Password
            </Link>
          </Button>
        </div>
      </div>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="size-4" />
            Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <MailIcon className="text-muted-foreground size-4 shrink-0" />
            <span>{user.mail}</span>
          </div>
          {user.phone && (
            <div className="flex items-center gap-2 text-sm">
              <PhoneIcon className="text-muted-foreground size-4 shrink-0" />
              <span>{user.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vessel */}
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

      {/* Emergency contact */}
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

      {/* Medical notes */}
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

      {/* Privacy */}
      <div className="flex flex-col gap-3">
        <Separator />
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Privacy</p>
        <div className="flex flex-col gap-2">
          <DataExportButton />
        </div>
        <div className="border-destructive/30 mt-2 flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-destructive text-sm font-medium">Danger zone</p>
          <p className="text-muted-foreground text-sm">
            Request deletion of your account. You will have 30 days to cancel before all your
            personal data is permanently removed.
          </p>
          <div>
            <DeleteAccountButton />
          </div>
        </div>
      </div>
    </div>
  )
}
