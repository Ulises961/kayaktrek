import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class Day extends Model {
  static table = "days"

  @field("trip_id") tripId!: string
  @field("day_number") dayNumber!: number
  @field("date") date!: string | null
  @field("start_point_id") startPointId!: string | null
  @field("end_point_id") endPointId!: string | null
}
