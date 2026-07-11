from marshmallow import fields

from Schemas.base_schema import BaseSchema


class _AccessingLeaderSchema(BaseSchema):
    """Shallow projection of the leader who read the notes — just enough to identify who."""
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)


class MedicalNotesAccessLogSchema(BaseSchema):
    """Serialises one medical-notes access event. Serialise-only — rows are written
    internally by TripMemberService.read_shared_medical_notes, never via a load path."""
    created = fields.DateTime(dump_only=True)
    leader = fields.Nested(_AccessingLeaderSchema, dump_only=True)
