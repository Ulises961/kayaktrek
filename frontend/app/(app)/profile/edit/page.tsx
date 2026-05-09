import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { PageBreadcrumb } from "@/components/common/page-breadcrumb"
import { EditProfileForm } from "@/components/profile/edit-profile-form"

export default async function EditProfilePage() {
  let user
  try {
    const raw = await apiGet("/api/user/me")
    user = UserSchema.parse(raw)
  } catch {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageBreadcrumb crumbs={[{ label: "Profile", href: "/profile" }, { label: "Edit" }]} />
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <EditProfileForm user={user} />
    </div>
  )
}
