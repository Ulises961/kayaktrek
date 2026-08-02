from marshmallow import fields

from Schemas.base_schema import BaseSchema


class SessionSchema(BaseSchema):
    """Read-only projection of a device session for the "Your devices" list (M17).

    Everything is dump_only: sessions are created by logging in and ended by revoking
    them, never edited. `isCurrent` marks the device making the request so the UI can
    label it rather than inviting the user to sign themselves out by accident.

    `tokenVersion` is deliberately absent — it is rotation state, not something a user
    can act on, and publishing it narrates our refresh mechanics for no benefit.
    """
    device_label = fields.String(dump_only=True)
    location_label = fields.String(dump_only=True)
    created = fields.DateTime(dump_only=True)
    last_used_at = fields.DateTime(dump_only=True)
    expires_at = fields.DateTime(dump_only=True)
    is_current = fields.Boolean(dump_only=True)
