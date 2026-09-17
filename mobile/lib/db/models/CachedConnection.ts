import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedConnection extends Model {
  static table = "cached_connections"

  @field("status") status!: string
  @field("requester_id") requesterId!: string | null
  @field("requester_username") requesterUsername!: string
  @field("requester_name") requesterName!: string
  @field("requester_surname") requesterSurname!: string | null
  @field("addressee_id") addresseeId!: string | null
  @field("addressee_username") addresseeUsername!: string
  @field("addressee_name") addresseeName!: string
  @field("addressee_surname") addresseeSurname!: string | null
}
