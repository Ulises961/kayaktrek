import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { listConnections } from "@/lib/connections/actions"
import { listBlocks } from "@/lib/blocks/actions"
import { PaddlersHub } from "@/components/paddlers/paddlers-hub"
import { PageHeading } from "@/components/common/page-heading"

export const metadata = {
  title: "Paddlers",
}

export default async function PaddlersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  const [{ q }, connections, blocks] = await Promise.all([
    searchParams,
    listConnections(),
    listBlocks(),
  ])

  return (
    <>
      <div>
        <PageHeading>Paddlers</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">
          Find paddlers, manage your buddies, and control who can reach you.
        </p>
      </div>

      <PaddlersHub
        connections={connections}
        blocks={blocks}
        currentUserId={session.userId}
        initialQuery={q ?? ""}
      />
    </>
  )
}
