import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { listConnections } from "@/lib/connections/actions"
import { listBlocks } from "@/lib/blocks/actions"
import { PaddlersHub } from "@/components/paddlers/paddlers-hub"

export const metadata = {
  title: "Paddlers — Kayak Expedition Planner",
}

export default async function PaddlersPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const [connections, blocks] = await Promise.all([listConnections(), listBlocks()])

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Paddlers</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find paddlers, manage your buddies, and control who can reach you.
        </p>
      </div>

      <PaddlersHub connections={connections} blocks={blocks} currentUserId={session.userId} />
    </div>
  )
}
