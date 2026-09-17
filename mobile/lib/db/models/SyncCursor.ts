import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class SyncCursor extends Model {
  static table = "sync_cursors"

  @field("trip_id") tripId!: string
  @field("last_pulled_at") lastPulledAt!: number
}
