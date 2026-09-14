import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { database as productionDatabase } from "./database"
import { TripMember } from "./models"

// Exactly the fields the float-plan crew manifest renders
// (app/(app)/(drawer)/(trips)/trips/[id]/float-plan.tsx) — a nested `user`
// object matching formatPaddlerName's shape (@shared/user/format.ts), plus
// the vessel/emergency-contact fields WP1 already made device-syncable.
export type OfflineCrewMember = {
  id: string
  role: string
  user: { name: string; surname: string | null; username: string | null }
  vesselMake: string | null
  vesselModel: string | null
  vesselLengthCm: number | null
  vesselColorPrimary: string | null
  vesselColorSecondary: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
}

// Shore contact (Logistics) has no local cache at all — it's not part of any
// M9c sync channel (spec §4 never covered it) — so the float plan screen's
// offline fallback can only ever show the crew manifest, not shore contact.
// That's a real, deliberate boundary, not an oversight: see the float-plan
// screen's own offline-notice copy.
export async function loadOfflineCrew(tripId: string, database: Database = productionDatabase): Promise<OfflineCrewMember[]> {
  const collection = database.collections.get<TripMember>("trip_members")
  const rows = await collection.query(Q.where("trip_id", tripId)).fetch()

  return [...rows]
    .sort((a, b) => (a.role === "leader" ? -1 : b.role === "leader" ? 1 : 0))
    .map((member) => ({
      id: member.id,
      role: member.role,
      user: {
        name: member.userName ?? "",
        surname: member.userSurname,
        username: member.userUsername,
      },
      vesselMake: member.vesselMake,
      vesselModel: member.vesselModel,
      vesselLengthCm: member.vesselLengthCm,
      vesselColorPrimary: member.vesselColorPrimary,
      vesselColorSecondary: member.vesselColorSecondary,
      emergencyContactName: member.emergencyContactName,
      emergencyContactPhone: member.emergencyContactPhone,
      emergencyContactRelationship: member.emergencyContactRelationship,
    }))
}
