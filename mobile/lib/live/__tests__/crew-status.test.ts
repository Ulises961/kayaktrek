import type { LivePosition } from "@shared/dtos/live-position"
import { formatPaddlerName } from "@shared/user/format"

import type { OfflineCrewMember } from "@mobile/lib/db/offline-float-plan"

import { crewStatusRows } from "../crew-status"
import { STALE_AFTER_MS } from "../crew-position-label"
import { formatAge } from "../position/sharing-status"

const NOW = Date.parse("2026-11-06T10:30:00Z")

function member(userId: string, name: string, overrides: Partial<OfflineCrewMember> = {}): OfflineCrewMember {
  return {
    id: `member-${userId}`,
    role: "crew",
    user: { id: userId, name, surname: "Paddler", username: name.toLowerCase() },
    vesselMake: null,
    vesselModel: null,
    vesselLengthCm: null,
    vesselColorPrimary: null,
    vesselColorSecondary: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    leftAt: null,
    leftNote: null,
    ...overrides,
  }
}

function heard(userId: string, minutesAgo: number): LivePosition {
  return {
    userId,
    name: "ignored: the member row names them",
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  }
}

describe("crewStatusRows", () => {
  it("lists each member with how long ago they were last heard from", () => {
    const ada = member("u1", "Ada")

    const [row] = crewStatusRows([ada], [heard("u1", 3)], NOW)

    expect(row).toEqual({
      userId: "u1",
      name: formatPaddlerName(ada.user),
      role: "crew",
      heardAgo: formatAge(3 * 60_000),
      quiet: false,
    })
  })

  it("says nothing is known about a member who has not shared a position, rather than leaving them off", () => {
    const [row] = crewStatusRows([member("u1", "Ada")], [], NOW)

    expect(row.heardAgo).toBeNull()
    expect(row.quiet).toBe(true)
  })

  it("marks a member not heard from for longer than the threshold as quiet", () => {
    const rows = crewStatusRows(
      [member("fresh", "Ada"), member("quiet", "Bea")],
      [heard("fresh", 1), heard("quiet", STALE_AFTER_MS / 60_000 + 1)],
      NOW,
    )

    expect(rows.map((row) => [row.userId, row.quiet])).toEqual([
      ["fresh", false],
      ["quiet", true],
    ])
  })

  it("leaves out a member who has left the trip", () => {
    const rows = crewStatusRows(
      [member("u1", "Ada"), member("u2", "Bea", { leftAt: "2026-11-06T08:00:00Z" })],
      [heard("u2", 1)],
      NOW,
    )

    expect(rows.map((row) => row.userId)).toEqual(["u1"])
  })

  it("keeps the order it was given, which is the leader first", () => {
    const rows = crewStatusRows(
      [member("lead", "Cy", { role: "leader" }), member("u1", "Ada")],
      [heard("u1", 1), heard("lead", 5)],
      NOW,
    )

    expect(rows.map((row) => [row.userId, row.role])).toEqual([
      ["lead", "leader"],
      ["u1", "crew"],
    ])
  })

  it("reads a ping with a time it cannot parse as not heard from", () => {
    const [row] = crewStatusRows([member("u1", "Ada")], [{ ...heard("u1", 1), recordedAt: "not a time" }], NOW)

    expect(row.heardAgo).toBeNull()
    expect(row.quiet).toBe(true)
  })
})
