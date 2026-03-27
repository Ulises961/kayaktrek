import { getSession } from "@/lib/auth/session"
import { logout } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"

export default async function DashboardPage() {
  const session = await getSession()

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-slate-700">
        Signed in as <span className="font-medium">{session?.email}</span>
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline">Sign out</Button>
      </form>
    </div>
  )
}
