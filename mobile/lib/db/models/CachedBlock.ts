import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedBlock extends Model {
  static table = "cached_blocks"

  @field("blocked_id") blockedId!: string | null
  @field("blocked_username") blockedUsername!: string
  @field("blocked_name") blockedName!: string
  @field("blocked_surname") blockedSurname!: string | null
}
