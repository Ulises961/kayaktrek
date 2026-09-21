import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CacheFreshness extends Model {
  static table = "cache_freshness"

  @field("key") key!: string
  @field("cached_at") cachedAt!: number
}
