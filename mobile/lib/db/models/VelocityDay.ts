import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

// What the map overlay needs to rebuild a day's wind or swell grid for any hour: the box
// it covers, the grid size and which cells are land. `id` is the day id. Sent whole by
// every pull (backend/Services/mobile_sync_service.py, docs/mobile/sync-protocol-spec.md §6.5).
export class VelocityDay extends Model {
  static table = "velocity_days"

  @field("day_id") dayId!: string
  @field("south") south!: number
  @field("north") north!: number
  @field("west") west!: number
  @field("east") east!: number
  /** Cells per axis. */
  @field("size") size!: number
  /** `size * size` characters, "1" where the cell is land, row-major from the north-west corner. */
  @field("land_mask") landMask!: string
}
