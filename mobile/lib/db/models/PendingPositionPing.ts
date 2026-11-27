import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class PendingPositionPing extends Model {
  static table = "pending_position_pings"

  @field("trip_id") tripId!: string
  @field("user_id") userId!: string
  @field("lat") lat!: number
  @field("lon") lon!: number
  @field("accuracy_m") accuracyM!: number | null
  @field("heading_deg") headingDeg!: number | null
  @field("speed_ms") speedMs!: number | null
  @field("recorded_at") recordedAt!: number
}
