import type { LivePosition } from "@shared/dtos/live-position"
import { formatPaddlerName } from "@shared/user/format"

import type { OfflineCrewMember } from "@mobile/lib/db/offline-float-plan"

import { STALE_AFTER_MS } from "./crew-position-label"
import { formatAge } from "./position/sharing-status"

export type CrewStatusRow = {
  userId: string
  name: string
  role: string
  // How long ago the member was last heard from; `null` when no position of theirs is known.
  heardAgo: string | null
  // Not heard from within `STALE_AFTER_MS`, or never. A phone standing still sends nothing by design,
  // so this means "worth asking", not "in trouble".
  quiet: boolean
}

// The Live screen's crew list: every member still on the trip, in the order given, joined with the
// newest position the poll has for them. A member with no position is listed, not left out: who has
// not been heard from is what a list like this is for.
export function crewStatusRows(
  members: OfflineCrewMember[],
  positions: LivePosition[],
  now: number,
): CrewStatusRow[] {
  const recordedAtByUser = new Map(positions.map((position) => [position.userId, Date.parse(position.recordedAt)]))

  return members
    .filter((member) => member.leftAt === null)
    .map((member) => {
      const recordedAt = recordedAtByUser.get(member.user.id)
      const known = recordedAt !== undefined && !Number.isNaN(recordedAt)
      const ageMs = known ? Math.max(0, now - recordedAt) : null
      return {
        userId: member.user.id,
        name: formatPaddlerName(member.user),
        role: member.role,
        heardAgo: ageMs === null ? null : formatAge(ageMs),
        quiet: ageMs === null || ageMs > STALE_AFTER_MS,
      }
    })
}
