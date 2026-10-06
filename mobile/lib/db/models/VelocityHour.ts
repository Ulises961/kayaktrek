import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

// One hour (0-23) of a day's wind and swell flow, in m/s, as the server computed it: null when
// the day has no usable forecast for that layer. `id` is `<dayId>:<hour>`.
export class VelocityHour extends Model {
  static table = "velocity_hours"

  @field("day_id") dayId!: string
  @field("hour") hour!: number
  @field("wind_u") windU!: number | null
  @field("wind_v") windV!: number | null
  @field("wave_u") waveU!: number | null
  @field("wave_v") waveV!: number | null
}
