import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

// Named TripSummary, not Trip, to avoid clashing with @shared/dtos/trip's Trip
// type — this model carries only the trip-list card's fields, not the full DTO.
export class TripSummary extends Model {
  static table = "trips"

  @field("destination") destination!: string | null
  @field("state") state!: string | null
  @field("date_from") dateFrom!: string | null
  @field("date_to") dateTo!: string | null
  @field("traveller_count") travellerCount!: number
}
