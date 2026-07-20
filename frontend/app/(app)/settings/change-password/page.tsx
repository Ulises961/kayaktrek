import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
import { ChangePasswordForm } from "@/components/profile/change-password-form"
import { PageHeading } from "@/components/common/page-heading"

export default function ChangePasswordPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
      <ChangePasswordForm />
    </div>
  )
}
