import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class RequirementContribution extends Model {
  static table = "requirement_contributions"

  @field("requirement_id") requirementId!: string
  @field("trip_member_id") tripMemberId!: string
  @field("item_id") itemId!: string
  @field("checked") checked!: boolean
}
