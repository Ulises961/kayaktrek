import { notFound } from "next/navigation"
import { apiGet, rethrowUnlessClientError } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
import { EditProfileForm } from "@/components/profile/edit-profile-form"
import { PageHeading } from "@/components/common/page-heading"

export default async function EditProfilePage() {
  let user
  try {
    const raw = await apiGet("/api/user/me")
    user = UserSchema.parse(raw)
  } catch (error) {
    rethrowUnlessClientError(error)
    notFound()
  }

  return (
    <>
      <SetBreadcrumbs crumbs={[{ label: "Profile", href: "/profile" }, { label: "Edit" }]} />
      <PageHeading>Edit profile</PageHeading>
      <EditProfileForm user={user} />
    </>
  )
}
