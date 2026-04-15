from marshmallow import fields, post_load
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import BaseSchema


class TripMemberSchema(BaseSchema):
    """Serialises and deserialises TripMember (role + user snapshot)."""
    user_id = fields.UUID(load_only=True, required=False)
    trip_id = fields.UUID(load_only=True, required=False)
    role = fields.Enum(MemberRoleType, by_value=True, load_default=MemberRoleType.CREW)
    user = fields.Nested(
        'UserSchema',
        exclude=['pwd', 'trips', 'itineraries', 'inventories', 'items',
                 'endorsed_logs', 'logs'],
        dump_only=True,
    )

    @post_load
    def make_trip_member(self, data, **kwargs):
        return TripMember(**data)
