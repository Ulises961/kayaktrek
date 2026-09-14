import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class Point extends Model {
  static table = "points"

  @field("day_id") dayId!: string
  @field("order_key") orderKey!: string | null
  @field("latitude") latitude!: number | null
  @field("longitude") longitude!: number | null
  @field("name") name!: string | null
  @field("notes") notes!: string | null
  @field("type") type!: string | null
}
