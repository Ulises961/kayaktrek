import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class Day extends Model {
  static table = "days"

  @field("day_number") dayNumber!: number
  @field("date") date!: string | null
  @field("start_point_id") startPointId!: string | null
  @field("end_point_id") endPointId!: string | null
}
