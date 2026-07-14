from marshmallow import fields, post_load, validates, ValidationError, pre_load
from Models.user import User, UnitPreferenceType
from Schemas.base_schema import BaseSchema, camelcase
from Schemas.log_schema import LogSchema
from Schemas.user_certification_schema import UserCertificationSchema
import re
import bleach


class UserSchema(BaseSchema):
    """
    User Schema
    used for loading/dumping User entities
    """
    mail = fields.Email(required=True, validate=lambda x: len(x) <= 255)
    pwd = fields.String(required=True, load_only=True, validate=lambda x: len(x) >= 8)
    # Optional since M12 §F — signup no longer asks for it; collected in Settings.
    phone = fields.String(allow_none=True, load_default=None, validate=lambda x: x is None or len(x) <= 20)
    username = fields.String(required=True, validate=lambda x: 3 <= len(x.strip()) <= 50)
    name = fields.String(required=True, validate=lambda x: 1 <= len(x.strip()) <= 100)
    surname = fields.String(allow_none=True, validate=lambda x: x is None or len(x.strip()) <= 100)
    trips = fields.List(fields.Nested('TripSchema', allow_none=True), dump_only=True)
    itineraries = fields.List(fields.Nested('ItinerarySchema', allow_none=True), dump_only=True)
    inventories = fields.List(fields.Nested('InventorySchema', allow_none=True), dump_only=True)
    items = fields.List(fields.Nested('ItemSchema', allow_none=True), dump_only=True)
    endorsed_logs = fields.List(fields.Nested(LogSchema), allow_none=True, dump_only=True)
    logs = fields.List(fields.Nested(LogSchema), allow_none=True, dump_only=True)
    avatar_url = fields.String(allow_none=True, dump_only=True)
    admin = fields.Bool(dump_only=True)

    vessel_make = fields.String(allow_none=True)
    vessel_model = fields.String(allow_none=True)
    vessel_length_cm = fields.Integer(allow_none=True)
    vessel_color_primary = fields.String(allow_none=True)
    vessel_color_secondary = fields.String(allow_none=True)
    emergency_contact_name = fields.String(allow_none=True)
    emergency_contact_phone = fields.String(allow_none=True)
    emergency_contact_relationship = fields.String(allow_none=True)

    certifications = fields.List(fields.Nested(UserCertificationSchema), dump_only=True)

    # Public profile (M7a) — opt-in, privacy-first. bio/home_location are free text;
    # profile_is_public gates the entire public projection.
    bio = fields.String(allow_none=True, validate=lambda x: x is None or len(x) <= 1000)
    home_location = fields.String(allow_none=True, validate=lambda x: x is None or len(x) <= 255)
    profile_is_public = fields.Boolean()

    # Distance-unit display preference — presentation only, storage stays km.
    unit_preference = fields.Enum(UnitPreferenceType, by_value=True, load_default=UnitPreferenceType.NM)

    # Consent timestamp only — ciphertext fields are never exposed via API
    medical_notes_consent_at = fields.DateTime(allow_none=True, dump_only=True)
    # Set when a password reset wiped the notes — drives the re-entry prompt in the UI
    medical_notes_reset_at = fields.DateTime(allow_none=True, dump_only=True)
    deletion_requested_at = fields.DateTime(allow_none=True, dump_only=True)
    # Set while an email-change request awaits confirmation — never mutable via PATCH,
    # only through the dedicated request-email-change/verify-email-change flow.
    pending_mail = fields.String(allow_none=True, dump_only=True)

    # Presence flag — clients use this to show the keypair-generation prompt
    has_keypair = fields.Method("get_has_keypair", dump_only=True)

    def get_has_keypair(self, obj):
        return getattr(obj, "public_key", None) is not None

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in ('name', 'surname', 'bio', 'homeLocation', 'home_location'):
            if key in data and data[key] is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates('username')
    def validate_username(self, value, **kwargs):
        """Validate username format and length."""
        if value is not None:
            if len(value) < 3:
                raise ValidationError("Username must be at least 3 characters long")
            if len(value) > 50:
                raise ValidationError("Username cannot exceed 50 characters")
            if not re.match(r'^[a-zA-Z0-9_-]+$', value):
                raise ValidationError(
                    "Username can only contain letters, numbers, underscores, and hyphens"
                )

    @validates('phone')
    def validate_phone(self, value, **kwargs):
        """Validate phone number format."""
        if value is not None:
            if len(value) > 20:
                raise ValidationError("Phone number cannot exceed 20 characters")
            # Remove common separators
            cleaned = re.sub(r'[\s\-\(\)\+]', '', value)
            if not cleaned.isdigit():
                raise ValidationError("Phone number must contain only digits")
            if len(cleaned) < 7 or len(cleaned) > 15:
                raise ValidationError("Phone number must be between 7 and 15 digits")

    @validates('name')
    def validate_name(self, value, **kwargs):
        """Validate and sanitize name."""
        if value is not None:
            # Sanitize HTML/script tags
            sanitized = bleach.clean(value.strip(), tags=[], strip=True)
            if not sanitized:
                raise ValidationError("Name cannot be empty")
            if len(sanitized) > 100:
                raise ValidationError("Name cannot exceed 100 characters")
            if re.search(r'[<>"\';\[\]{}]', sanitized):
                raise ValidationError("Name contains invalid characters")

    @validates('surname')
    def validate_surname(self, value, **kwargs):
        """Validate and sanitize surname."""
        if value is not None:
            # Sanitize HTML/script tags
            sanitized = bleach.clean(value.strip(), tags=[], strip=True)
            if len(sanitized) > 100:
                raise ValidationError("Surname cannot exceed 100 characters")
            if re.search(r'[<>"\';\[\]{}]', sanitized):
                raise ValidationError("Surname contains invalid characters")

    @validates('mail')
    def validate_mail(self, value, **kwargs):
        """Validate email format and length."""
        if value is not None:
            if len(value) > 255:
                raise ValidationError("Email cannot exceed 255 characters")
            # Additional email validation
            email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
            if not email_pattern.match(value):
                raise ValidationError("Invalid email format")

    @validates('pwd')
    def validate_pwd(self, value, **kwargs):
        """Validate password strength."""
        if value is not None:
            if len(value) < 8:
                raise ValidationError("Password must be at least 8 characters long")
            if len(value) > 128:
                raise ValidationError("Password cannot exceed 128 characters")
            # Check for at least one letter and one number
            if not re.search(r'[a-zA-Z]', value) or not re.search(r'[0-9]', value):
                raise ValidationError("Password must contain at least one letter and one number")
            # Check for at least one special character
            if not re.search(r'[!@#$%^&*(),.?":{}|<>]', value):
                raise ValidationError("Password must contain at least one special character")

    @post_load
    def make_user(self, data, **kwargs):
        return User(**data)


class UserUpdateSchema(UserSchema):
    """
    Schema for PATCH /api/user/<id>.

    All fields are optional — only present fields are validated.
    mail is excluded: email changes require a dedicated verification flow.
    pwd is accepted and validated here; the service handles hashing.
    Medical notes fields are excluded — managed via dedicated consent endpoints.
    """
    mail = fields.Email(dump_only=True)
    pwd = fields.String(load_only=True)
    # allow_none so Settings can clear a stored number, not just change it
    phone = fields.String(allow_none=True, validate=lambda x: x is None or len(x) <= 20)
    username = fields.String(validate=lambda x: 3 <= len(x.strip()) <= 50)
    name = fields.String(validate=lambda x: 1 <= len(x.strip()) <= 100)
    surname = fields.String(allow_none=True, validate=lambda x: x is None or len(x.strip()) <= 100)
    # No load_default here — a PATCH omitting this field must leave it untouched,
    # unlike UserSchema's create-time default.
    unit_preference = fields.Enum(UnitPreferenceType, by_value=True)

    # Medical notes and consent fields are not mutable through this schema
    medical_notes_consent_at = fields.DateTime(dump_only=True)
    deletion_requested_at = fields.DateTime(dump_only=True)
    pending_mail = fields.String(dump_only=True)

    @post_load
    def make_user(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}  # camelCase dict for the service


class PublicUserSchema(BaseSchema):
    """Privacy-safe public projection of a paddler (M7a).

    Exposes ONLY self-presentation + opt-in certifications. Aggregate `stats` are
    attached by the resource. Deliberately NEVER serialises: mail, phone, vessel,
    emergency contact, medical notes/consent, deletion state, keys, admin, or
    individual logs. Certifications drop membership_number — a semi-identifier that
    has no place on a public page.
    """
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    surname = fields.String(dump_only=True)
    avatar_url = fields.String(dump_only=True)
    bio = fields.String(dump_only=True)
    home_location = fields.String(dump_only=True)
    certifications = fields.List(
        fields.Nested(
            UserCertificationSchema,
            only=("organization", "award", "awarded_at", "valid_until"),
        ),
        dump_only=True,
    )
