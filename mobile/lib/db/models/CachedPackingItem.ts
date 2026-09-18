import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedPackingItem extends Model {
  static table = "cached_packing_items"

  @field("trip_id") tripId!: string
  @field("item_id") itemId!: string | null
  @field("item_name") itemName!: string
  @field("checked") checked!: boolean | null
}
