import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
import { ChangePasswordForm } from "@/components/profile/change-password-form"
import { PageHeading } from "@/components/common/page-heading"
import { getMe } from "@/lib/user/me"

export default async function ChangePasswordPage() {
  // Shares the layout's cached /api/user/me call (getMe uses React cache()) — this doesn't
  // cost a second round trip. hasKeypair tells the form whether a medical-notes private key
  // needs to be re-wrapped locally when the password changes (M22).
  const user = await getMe()

  return (
    <>
      <SetBreadcrumbs
        crumbs={[{ label: "Settings", href: "/settings" }, { label: "Change password" }]}
      />
      <div>
        <PageHeading>Change password</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">
          Your new password must be at least 8 characters and include a letter, a number, and a
          special character.
        </p>
      </div>
      <ChangePasswordForm hasKeypair={user?.hasKeypair ?? false} />
    </>
  )
}
