import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedLog extends Model {
  static table = "cached_logs"

  @field("kind") kind!: string
  @field("date") date!: string | null
  @field("hours") hours!: number | null
  @field("distance") distance!: number | null
  @field("avg_sea") avgSea!: number | null
  @field("endorsement_count") endorsementCount!: number | null
}
