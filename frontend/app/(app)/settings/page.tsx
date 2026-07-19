import { notFound } from "next/navigation"
import Link from "next/link"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { UnitPreferenceSelect } from "@/components/settings/unit-preference-select"
import { EmailChangeSection } from "@/components/settings/email-change-section"
import { PhoneSection } from "@/components/settings/phone-section"
import { DeleteAccountButton } from "@/components/profile/delete-account-button"
import { DataExportButton } from "@/components/profile/data-export-button"
import { SignOutEverywhereButton } from "@/components/profile/sign-out-everywhere-button"
import { PageHeading } from "@/components/common/page-heading"
import { LockIcon, RulerIcon, MailIcon, ShieldIcon, DownloadIcon } from "lucide-react"

export default async function SettingsPage() {
  let user
  try {
    const raw = await apiGet("/api/user/me")
    user = UserSchema.parse(raw)
  } catch {
    notFound()
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SetBreadcrumbs crumbs={[{ label: "Settings" }]} />

      <div>
        <PageHeading>Settings</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">
          Account, security, and data — self-presentation lives on your{" "}
          <Link href="/profile" className="hover:text-foreground underline underline-offset-2">
            profile
          </Link>
          .
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailIcon className="size-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <EmailChangeSection currentMail={user.mail} pendingMail={user.pendingMail} />
          <Separator />
          <PhoneSection initialPhone={user.phone} />
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">Password</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/change-password">
                <LockIcon className="size-4" />
                Change password
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RulerIcon className="size-4" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UnitPreferenceSelect initialUnit={user.unitPreference} />
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldIcon className="size-4" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Signing out ends your session on every device at once — there is no separate per-device
            session list to manage individually.
          </p>
          <SignOutEverywhereButton />
        </CardContent>
      </Card>

      {/* Privacy & data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DownloadIcon className="size-4" />
            Privacy & data
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DataExportButton />
          <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-destructive text-sm font-medium">Danger zone</p>
            <p className="text-muted-foreground text-sm">
              Request deletion of your account. You will have 30 days to cancel before all your
              personal data is permanently removed.
            </p>
            <div>
              <DeleteAccountButton />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
