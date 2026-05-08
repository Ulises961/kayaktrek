import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { ChangePasswordForm } from "@/components/profile/change-password-form"

export default function ChangePasswordPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageBreadcrumb crumbs={[{ label: "Profile", href: "/profile" }, { label: "Change password" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your new password must be at least 8 characters and include a letter, a number, and a special character.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  )
}
