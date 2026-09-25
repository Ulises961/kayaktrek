import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class RouteMeta extends Model {
  static table = "route_meta"

  @field("trip_id") tripId!: string
  @field("route_version") routeVersion!: number
  @field("has_local_changes") hasLocalChanges!: boolean | null
  @field("in_conflict") inConflict!: boolean | null
}
