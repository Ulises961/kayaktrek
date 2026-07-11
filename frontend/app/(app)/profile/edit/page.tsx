import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
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
    <div className="flex max-w-2xl flex-col gap-6">
      <SetBreadcrumbs crumbs={[{ label: "Profile", href: "/profile" }, { label: "Edit" }]} />
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <EditProfileForm user={user} />
    </div>
  )
}
