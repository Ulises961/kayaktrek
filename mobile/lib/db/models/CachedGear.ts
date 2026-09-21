import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedGear extends Model {
  static table = "cached_gear"

  @field("name") name!: string
  @field("status") status!: string | null
  @field("category_name") categoryName!: string | null
  @field("default_pack") defaultPack!: boolean | null
}
