import type { Connection, Relationship } from "@/lib/dtos/connection"

// The caller's relationship to another paddler, read from the caller's own connection rows. The
// backend annotates each search result with the same thing, but that is a snapshot taken when
// the search ran; the connection rows are what the page re-reads, so a result that is drawn from
// them stays true when the other side accepts.
export function relationshipWith(
  otherUserId: string,
  connections: Connection[],
  currentUserId: string,
): { relationship: Relationship; connectionId: string | null } {
  const connection = connections.find(
    (row) => row.requester.id === otherUserId || row.addressee.id === otherUserId,
  )
  if (!connection) return { relationship: "none", connectionId: null }

  const connectionId = connection.id ?? null
  if (connection.status === "accepted") return { relationship: "buddy", connectionId }
  const sentByCaller = connection.requester.id === currentUserId
  return { relationship: sentByCaller ? "pending_outgoing" : "pending_incoming", connectionId }
}
