import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedLogisticsItem extends Model {
  static table = "cached_logistics"

  @field("trip_id") tripId!: string
  @field("kind") kind!: string
  @field("position") position!: number
  @field("payload") payload!: string
}
