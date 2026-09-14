import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class Weather extends Model {
  static table = "weather"

  @field("day_id") dayId!: string
  @field("model") model!: string | null
  @field("fetched_at") fetchedAt!: number | null
}
