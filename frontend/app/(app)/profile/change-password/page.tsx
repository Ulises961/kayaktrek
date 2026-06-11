import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { ChangePasswordForm } from "@/components/profile/change-password-form"

export default function ChangePasswordPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageBreadcrumb
        crumbs={[{ label: "Profile", href: "/profile" }, { label: "Change password" }]}
      />
      <div>
        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your new password must be at least 8 characters and include a letter, a number, and a
          special character.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  )
}
