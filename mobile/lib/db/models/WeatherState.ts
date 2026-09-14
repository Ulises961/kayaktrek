import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class WeatherState extends Model {
  static table = "weather_states"

  @field("day_id") dayId!: string
  @field("time") time!: string
  @field("temperature") temperature!: number | null
  @field("precipitation") precipitation!: number | null
  @field("wind_direction") windDirection!: number | null
  @field("wind_force") windForce!: number | null
  @field("cloud") cloud!: string | null
}
