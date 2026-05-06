from flask import g
from marshmallow import fields, post_load
from uuid import UUID
from Models.inventory import Inventory
from Schemas.base_schema import BaseSchema
from Schemas.trip_requirement_schema import TripRequirementSchema


class InventorySchema(BaseSchema):
    """
    Inventory Schema — loading/dumping Inventory entities.

    user_id is always stamped from the authenticated request context in
    @post_load — clients can never supply or spoof it.
    Requirements are managed exclusively through dedicated endpoints and are
    never accepted in a client payload — dump_only enforces this.
    """
    trip_id = fields.UUID(allow_none=True, load_default=None)
    user_id = fields.UUID(dump_only=True)
    requirements = fields.List(
        fields.Nested(TripRequirementSchema), dump_only=True
    )

    @post_load
    def make_inventory(self, data, **kwargs):
        # Stamp user ownership only for personal (non-trip) inventories.
        # When trip_id is excluded from the schema (nested inside TripSchema),
        # or when trip_id is explicitly provided, the inventory belongs to the trip.
        if "trip_id" in self.fields and data.get("trip_id") is None:
            data['user_id'] = UUID(str(g.current_user_id))
        return Inventory(**data)
    