import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class SeaState extends Model {
  static table = "sea_states"

  @field("day_id") dayId!: string
  @field("time") time!: string
  @field("wave_height") waveHeight!: number | null
  @field("wave_direction") waveDirection!: number | null
  @field("swell_wave_height") swellWaveHeight!: number | null
  @field("swell_direction") swellDirection!: number | null
  @field("swell_period") swellPeriod!: number | null
  @field("current_speed") currentSpeed!: number | null
  @field("current_direction") currentDirection!: number | null
}
