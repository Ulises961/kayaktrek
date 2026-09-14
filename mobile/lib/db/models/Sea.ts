import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class Sea extends Model {
  static table = "sea"

  @field("day_id") dayId!: string
  @field("moon_phase") moonPhase!: string | null
  @field("high_tide") highTide!: string | null
  @field("low_tide") lowTide!: string | null
  @field("tidal_range_m") tidalRangeM!: number | null
  @field("tidal_source") tidalSource!: string | null
  @field("recorded_at") recordedAt!: number | null
}
