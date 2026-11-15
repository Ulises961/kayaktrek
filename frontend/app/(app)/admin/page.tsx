import { notFound } from "next/navigation"
import { MailCheckIcon } from "lucide-react"
import { getMe } from "@/lib/user/me"
import { SetBreadcrumbs } from "@/components/common/set-breadcrumbs"
import { PageHeading } from "@/components/common/page-heading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CorrectUnverifiedMailForm } from "@/components/admin/correct-unverified-mail-form"

export const metadata = {
  title: "Admin",
}

export default async function AdminPage() {
  // The backend refuses every admin call from anyone else; this only keeps the page itself
  // from existing for them, so a 404 rather than a form that always fails.
  const user = await getMe()
  if (!user?.admin) notFound()

  return (
    <>
      <SetBreadcrumbs crumbs={[{ label: "Admin" }]} />

      <div>
        <PageHeading>Admin</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">Support tools.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheckIcon className="size-4" />
            Correct a mistyped signup address
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            For someone who never got their verification email because they mistyped it. Only
            accounts that are not yet verified qualify. The old links stop working and a new one
            goes to the address below.
          </p>
          <CorrectUnverifiedMailForm />
        </CardContent>
      </Card>
    </>
  )
}
