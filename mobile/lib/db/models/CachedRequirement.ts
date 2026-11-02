import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedRequirement extends Model {
  static table = "cached_requirements"

  @field("trip_id") tripId!: string
  @field("name") name!: string
  @field("status") status!: string | null
  @field("category") category!: string | null
}
