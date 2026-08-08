import { notFound } from "next/navigation"
import { apiGet, rethrowIfRedirect } from "@/lib/api/client"
import { UserSchema } from "@/lib/dtos/user"
import { UserAvatar } from "@/components/common/user-avatar"
import { Card, CardContent } from "@/components/ui/card"

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    const raw = await apiGet(`/api/user/${id}`)
    user = UserSchema.parse(raw)
  } catch (error) {
    rethrowIfRedirect(error)
    notFound()
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-8 pb-6">
          <UserAvatar name={user.name} surname={user.surname} imageUrl={user.avatarUrl} size="lg" />
          <div className="text-center">
            <p className="text-lg font-semibold">
              {[user.name, user.surname].filter(Boolean).join(" ")}
            </p>
            <p className="text-muted-foreground text-sm">@{user.username}</p>
          </div>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Logs, endorsements, and buddy requests coming in M7.
      </p>
    </>
  )
}
