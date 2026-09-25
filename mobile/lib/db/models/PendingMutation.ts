import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class PendingMutation extends Model {
  static table = "pending_mutations"

  @field("mutation_id") mutationId!: string
  @field("user_id") userId!: string
  @field("entity_type") entityType!: string
  @field("operation") operation!: string
  @field("entity_id") entityId!: string
  @field("payload") payload!: string
  @field("device_timestamp") deviceTimestamp!: number
  @field("status") status!: string
  @field("reason") reason!: string | null
}
