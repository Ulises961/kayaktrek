import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, cast
import logging
from uuid import UUID

from flask import current_app
from flask_bcrypt import check_password_hash, generate_password_hash
from sqlalchemy.exc import IntegrityError, NoResultFound
from Api.database import db
from Models.auth_token import AuthToken, AuthTokenType
from Models.session import Session
from Models.user import User
from Schemas.user_schema import UserSchema
from Services.mail_service import send_template_email
from Services.session_service import SessionService

logger = logging.getLogger(__name__)

_TOKEN_EXPIRY_HOURS = {
    AuthTokenType.VERIFICATION: 24,
    AuthTokenType.RESET: 1,
    AuthTokenType.DATA_EXPORT: 24,
    AuthTokenType.DELETION_CANCEL: 24 * 30,  # 30-day grace window
    AuthTokenType.EMAIL_CHANGE: 1,
}

# Pre-computed hash used to equalise login timing when the account does not exist.
_DUMMY_HASH: str = generate_password_hash("timing-equalizer").decode("UTF-8")


class AuthService:

    _KEYPAIR_FIELDS = (
        "publicKey", "privateKeyCiphertext", "privateKeyNonce", "privateKeySalt",
    )

    @staticmethod
    def authenticate_user(password: str, mail_addr: Optional[str] = None, username: Optional[str] = None) -> Optional[User]:
        """
        Authenticate a user by password plus either email or username (one is required).

        Returns:
            User object if credentials are valid and account is active, None otherwise.
        """
        if not mail_addr and not username:
            return None

        query = db.session.query(User)
        if mail_addr:
            user = query.filter_by(mail=mail_addr).first()
        else:
            user = query.filter_by(username=username).first()

        if not user:
            check_password_hash(_DUMMY_HASH, password)
            return None
        # Verify the password before disclosing any account state. Until the password is
        # proven, every path must return the same generic failure — otherwise the distinct
        # deletion_pending PermissionError is an enumeration oracle that lets anyone probe
        # which addresses are mid-deletion (a deletion-pending account is also inactive).
        if not check_password_hash(user.pwd, password):
            return None
        # Password proven below. A legitimate owner still gets the actionable
        # "cancel deletion" signal; a deletion-pending account is inactive, so this
        # must be checked before the generic inactive branch.
        if user.deletion_requested_at is not None:
            raise PermissionError("deletion_pending")
        if not user.active:
            return None
        return user

    @staticmethod
    def register_user(user_json: dict) -> User:
        """
        Register a new user with active=False.
        Sends an email verification token. In testing mode the email is suppressed.

        When the submitted email address already has an account, sends a "you already have an
        account" email to that address and returns normally — no error is raised and no HTTP
        signal is given to the caller, preventing email enumeration.

        Raises:
            ValueError: If user was not correctly persisted after creation
        """
        username = user_json.get("username")
        mail_addr = user_json.get("mail")

        existing = db.session.query(User).filter(
            (User.username == username) | (User.mail == mail_addr)
        ).first()
        if existing:
            if existing.mail == mail_addr:
                AuthService._send_already_registered_email(existing)
            return existing

        # Full name is optional at signup (simplify-register) — collected later in
        # Settings, same pattern as phone (M12 §F). name stays NOT NULL on the model,
        # so default it to the username rather than relaxing the column.
        if not user_json.get("name"):
            user_json["name"] = username

        user = cast(User, UserSchema().load(user_json))
        user.active = False
        db.session.add(user)
        try:
            db.session.commit()
        except IntegrityError:
            # Two requests raced the existence check above with the same mail/username —
            # the loser's INSERT hits the unique constraint. Treat it exactly like the
            # pre-check "existing" branch: no error, no enumeration signal.
            db.session.rollback()
            existing = db.session.query(User).filter(
                (User.username == username) | (User.mail == mail_addr)
            ).first()
            if existing:
                if existing.mail == mail_addr:
                    AuthService._send_already_registered_email(existing)
                return existing
            raise

        persisted_user: Optional[User] = db.session.query(User).filter_by(mail=mail_addr).first()
        if not persisted_user:
            raise ValueError("User generated incorrectly")
        user = persisted_user

        # Medical-notes keypair (M22): generated on the client and posted alongside the
        # registration fields, so the server never sees the password that wraps it.
        # Optional — a client that omits it (or an older one) gets an account with no
        # keypair, which POST /api/v1/user/me/keypair fills in later. This runs only
        # for a genuinely new user: every "already registered" path above returns
        # early, so a repeat registration can never overwrite the keys of the existing
        # account and orphan its notes.
        keypair = {field: user_json.get(field) for field in AuthService._KEYPAIR_FIELDS}
        if all(keypair.values()):
            user.public_key = keypair["publicKey"]
            user.private_key_ciphertext = keypair["privateKeyCiphertext"]
            user.private_key_nonce = keypair["privateKeyNonce"]
            user.private_key_salt = keypair["privateKeySalt"]
        db.session.commit()

        AuthService._send_verification_email(user)
        logger.info(f"New user registered: {user.username}")
        return user

    @staticmethod
    def verify_account(raw_token: str) -> User:
        """
        Activate a user account using a verification token.

        Raises:
            ValueError: If token is invalid, expired, or already used
        """
        token = AuthService._consume_token(raw_token, AuthTokenType.VERIFICATION)
        user = db.session.query(User).filter_by(id=token.user_id).first()
        if not user:
            raise ValueError("User not found")
        user.active = True
        db.session.commit()
        logger.info(f"Account activated for user {user.username}")
        return user

    @staticmethod
    def resend_verification(mail_addr: str) -> None:
        """
        Invalidate existing verification tokens and issue a new one.

        Raises:
            NoResultFound: If no user exists with the given mail
            ValueError: If user is already active
        """
        user = db.session.query(User).filter_by(mail=mail_addr).first()
        if not user:
            raise NoResultFound(f"No user with mail {mail_addr}")
        if user.active:
            raise ValueError("Account is already active")

        # Invalidate any existing unused verification tokens
        db.session.query(AuthToken).filter_by(
            user_id=user.id,
            type=AuthTokenType.VERIFICATION,
            used=False,
        ).update({"used": True})
        db.session.commit()

        AuthService._send_verification_email(user)

    @staticmethod
    def request_password_reset(mail_addr: str) -> None:
        """
        Generate a password reset token and send a reset email.
        Silently succeeds if the mail address is not registered (prevents enumeration).
        """
        user = db.session.query(User).filter_by(mail=mail_addr).first()
        if not user:
            return  # silent — do not reveal whether the address is registered

        # Invalidate existing unused reset tokens
        db.session.query(AuthToken).filter_by(
            user_id=user.id,
            type=AuthTokenType.RESET,
            used=False,
        ).update({"used": True})
        db.session.commit()

        raw_token = AuthService._create_token(user.id, AuthTokenType.RESET)
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        reset_url = f"{frontend_url}/reset-password?token={raw_token}"

        send_template_email(
            user.mail,
            "Reset your Kayaktrek password",
            "password_reset",
            name=user.name,
            reset_url=reset_url,
        )

    @staticmethod
    def reset_password(raw_token: str, new_pwd: str) -> User:
        """
        Reset a user's password using a valid reset token.

        Raises:
            ValueError: If token is invalid, expired, or already used
        """
        token = AuthService._consume_token(raw_token, AuthTokenType.RESET)
        user = db.session.query(User).filter_by(id=token.user_id).first()
        if not user:
            raise ValueError("User not found")
        user.pwd = generate_password_hash(new_pwd).decode("UTF-8")
        user.password_changed_at = datetime.now(timezone.utc)
        user.token_version += 1
        SessionService.revoke_all_for_user(user.id, reason="password_reset")
        # The private key is derived from the old password; after a reset it is
        # undecryptable. Clear the keypair and any medical notes ciphertext so
        # the UI reflects reality rather than holding orphaned encrypted data.
        had_medical_notes = user.medical_notes_ciphertext is not None
        user.medical_notes_ciphertext = None
        user.medical_notes_nonce = None
        user.medical_notes_salt = None
        user.medical_notes_consent_at = None
        user.public_key = None
        user.private_key_ciphertext = None
        user.private_key_nonce = None
        user.private_key_salt = None
        # Flag the data loss so the UI can prompt the user to re-enter their notes.
        # Only set + notify when notes actually existed — never nag users who never used the feature.
        if had_medical_notes:
            user.medical_notes_reset_at = datetime.now(timezone.utc)
        db.session.commit()
        if had_medical_notes:
            AuthService._send_medical_notes_cleared_email(user)
        logger.info(
            "password_reset",
            extra={"user_id": str(user.id), "medical_notes_cleared": had_medical_notes},
        )
        return user

    @staticmethod
    def verify_email_change(raw_token: str) -> User:
        """
        Complete an email-change request using a valid EMAIL_CHANGE token.

        Swaps `mail` to the pending address, clears `pending_mail`, and bumps
        `token_version` — email is the login identifier, so every outstanding
        session on the old identity must end, exactly like a password reset.
        Notifies the old address afterward.

        Raises:
            ValueError: If the token is invalid/expired/used, there is no pending
                request left to consume, or the pending address was claimed by
                someone else in the meantime.
        """
        token = AuthService._consume_token(raw_token, AuthTokenType.EMAIL_CHANGE)
        user = db.session.query(User).filter_by(id=token.user_id).first()
        if not user:
            raise ValueError("User not found")
        if not user.pending_mail:
            raise ValueError("No pending email change for this account")

        new_mail = user.pending_mail
        conflict = db.session.query(User).filter(
            User.mail == new_mail, User.id != user.id
        ).first()
        if conflict:
            user.pending_mail = None
            db.session.commit()
            raise ValueError("This email address is no longer available")

        old_mail = user.mail
        user.mail = new_mail
        user.pending_mail = None
        user.token_version += 1
        SessionService.revoke_all_for_user(user.id, reason="email_changed")
        db.session.commit()

        AuthService._send_email_changed_notice(user, old_mail)
        logger.info("email_changed", extra={"user_id": str(user.id)})
        return user

    @staticmethod
    def rotate_session(user: User, payload: dict, location_label: Optional[str] = None) -> Session:
        """
        Validate a decoded refresh-token payload against its own session and, if valid,
        advance that session's rotation counter. Returns the session so the caller can mint
        the new access/refresh pair against it.

        A refresh token whose `rtv` claim does not match its session's token_version was
        already exchanged once — either the legitimate client raced a retry, or the token
        was stolen and is being replayed. Either way it is treated as theft, but the
        blast radius is one device: that session is revoked and its access tokens are
        denylisted, while the user's other devices stay signed in (M17). The global
        token_version kill switch is reserved for actions the user actually took.

        Raises:
            ValueError: token invalidated by password change (stale iat), unknown/revoked/
                expired session, or reuse detected.
        """
        iat = payload.get("iat")
        if iat and user.password_changed_at:
            token_issued_at = datetime.fromtimestamp(iat, tz=timezone.utc)
            if token_issued_at < user.password_changed_at:
                raise ValueError("Token invalidated by password change — please log in again")

        session_id = payload.get("sid")
        if not session_id:
            raise ValueError("Session invalidated — please log in again")

        session = SessionService.get_usable(str(session_id), user.id)
        if not session:
            raise ValueError("Session invalidated — please log in again")

        if payload.get("rtv") != session.token_version:
            SessionService.revoke(session, reason="refresh_token_reuse")
            logger.warning(
                "refresh_token_reuse_detected",
                extra={"user_id": str(user.id), "session_id": str(session.id)},
            )
            raise ValueError("Session invalidated — possible token reuse detected, please log in again")

        SessionService.rotate(session, location_label=location_label)
        return session

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _create_token(user_id: UUID, token_type: AuthTokenType) -> str:
        """Generate a raw token, persist its hash, and return the raw value."""
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        expiry_hours = _TOKEN_EXPIRY_HOURS[token_type]
        auth_token = AuthToken()
        auth_token.user_id = user_id
        auth_token.token_hash = token_hash
        auth_token.type = token_type
        auth_token.expires_at = datetime.now(timezone.utc) + timedelta(hours=expiry_hours)

        db.session.add(auth_token)
        db.session.commit()
        return raw

    @staticmethod
    def _consume_token(raw_token: str, token_type: AuthTokenType) -> AuthToken:
        """
        Look up, validate, and mark as used a token of the given type.
        Raises ValueError on any failure (invalid, expired, wrong type, already used).
        """
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token = db.session.query(AuthToken).filter_by(
            token_hash=token_hash, type=token_type
        ).first()

        if not token:
            raise ValueError("Invalid token")
        if token.used:
            raise ValueError("Token has already been used")
        expires_at = (
            token.expires_at.astimezone(timezone.utc)
            if token.expires_at.tzinfo is not None
            else token.expires_at.replace(tzinfo=timezone.utc)
        )
        if expires_at < datetime.now(timezone.utc):
            raise ValueError("Token has expired")

        token.used = True
        db.session.commit()
        return token

    @staticmethod
    def _send_verification_email(user: User) -> None:
        raw_token = AuthService._create_token(user.id, AuthTokenType.VERIFICATION)
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        verify_url = f"{frontend_url}/verify?token={raw_token}"

        send_template_email(
            user.mail,
            "Verify your Kayaktrek account",
            "account_verification",
            name=user.name,
            verify_url=verify_url,
        )

    @staticmethod
    def _send_medical_notes_cleared_email(user: User) -> None:
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        send_template_email(
            user.mail,
            "Your Kayaktrek medical notes were removed",
            "medical_notes_cleared",
            name=user.name,
            profile_url=f"{frontend_url}/profile",
        )

    @staticmethod
    def _send_email_change_confirm(user: User, new_mail: str) -> None:
        raw_token = AuthService._create_token(user.id, AuthTokenType.EMAIL_CHANGE)
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        confirm_url = f"{frontend_url}/verify-email-change?token={raw_token}"

        send_template_email(
            new_mail,
            "Confirm your new Kayaktrek email address",
            "email_change_confirm",
            name=user.name,
            confirm_url=confirm_url,
        )

    @staticmethod
    def _send_email_changed_notice(user: User, old_mail: str) -> None:
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        send_template_email(
            old_mail,
            "Your Kayaktrek email address was changed",
            "email_change_notice",
            name=user.name,
            new_mail=user.mail,
            forgot_url=f"{frontend_url}/forgot-password",
        )

    @staticmethod
    def _send_already_registered_email(user: User) -> None:
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
        send_template_email(
            user.mail,
            "Someone tried to register with your Kayaktrek email",
            "account_already_registered",
            name=user.name,
            login_url=f"{frontend_url}/login",
            forgot_url=f"{frontend_url}/forgot-password",
        )
