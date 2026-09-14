import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class TripMember extends Model {
  static table = "trip_members"

  @field("trip_id") tripId!: string
  @field("user_id") userId!: string
  @field("user_name") userName!: string | null
  @field("user_surname") userSurname!: string | null
  @field("user_username") userUsername!: string | null
  @field("role") role!: string
  @field("nominated_successor") nominatedSuccessor!: boolean
  @field("vessel_make") vesselMake!: string | null
  @field("vessel_model") vesselModel!: string | null
  @field("vessel_length_cm") vesselLengthCm!: number | null
  @field("vessel_color_primary") vesselColorPrimary!: string | null
  @field("vessel_color_secondary") vesselColorSecondary!: string | null
  @field("emergency_contact_name") emergencyContactName!: string | null
  @field("emergency_contact_phone") emergencyContactPhone!: string | null
  @field("emergency_contact_relationship") emergencyContactRelationship!: string | null
  @field("float_plan_confirmed_at") floatPlanConfirmedAt!: number | null
}
