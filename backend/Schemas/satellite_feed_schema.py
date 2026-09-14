from marshmallow import fields, validates, ValidationError

from Schemas.base_schema import BaseSchema
from Services.SatelliteFeeds.types import SatelliteProvider


class SatelliteFeedSchema(BaseSchema):
    """M29 — a user's registered satellite communicator feed (profile setting, not
    trip-scoped). `feedPassword` is write-only: accepted on create/update, encrypted
    server-side (SatelliteFeedService), and never echoed back in a response — same
    shape as any write-only secret field in this codebase, never a raw model mirror.
    """

    provider = fields.Enum(SatelliteProvider, by_value=True, required=True)
    feed_url = fields.String(required=True, validate=lambda x: 1 <= len(x.strip()) <= 500)
    feed_username = fields.String(allow_none=True, load_default=None)
    # write-only: never dumped back to the client
    feed_password = fields.String(allow_none=True, load_only=True, load_default=None)

    needs_reauth = fields.Boolean(dump_only=True)
    last_polled_at = fields.DateTime(dump_only=True, allow_none=True)
    last_ingested_at = fields.DateTime(dump_only=True, allow_none=True)
    created = fields.DateTime(dump_only=True)

    @validates("feed_url")
    def validate_feed_url(self, value, **kwargs):
        if not value.strip().lower().startswith("https://"):
            raise ValidationError("Feed URL must use https://")
