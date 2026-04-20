import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, cast
import logging
from uuid import UUID

from flask import current_app
from flask_bcrypt import check_password_hash, generate_password_hash
from flask_mail import Message
from sqlalchemy.exc import NoResultFound, IntegrityError

from Api.app import mail
from Api.database import db
from Models.auth_token import AuthToken, AuthTokenType
from Models.user import User
from Schemas.user_schema import UserSchema

logger = logging.getLogger(__name__)

_TOKEN_EXPIRY_HOURS = {
    AuthTokenType.VERIFICATION: 24,
    AuthTokenType.RESET: 1,
}


class AuthService:

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

        if not user or not user.active:
            return None
        if check_password_hash(user.pwd, password):
            return user
        return None

    @staticmethod
    def register_user(user_json: dict) -> User:
        """
        Register a new user with active=False.
        Sends an email verification token. In testing mode the email is suppressed.

        Raises:
            IntegrityError: If a user with the same username or mail already exists
            ValueError: If user was not correctly persisted after creation
        """
        username = user_json.get("username")
        mail_addr = user_json.get("mail")

        existing = db.session.query(User).filter(
            (User.username == username) | (User.mail == mail_addr)
        ).first()
        if existing:
            raise IntegrityError(statement="User already present", params=None, orig=Exception())

        user = cast(User, UserSchema().load(user_json))
        user.active = False
        db.session.add(user)
        db.session.commit()

        user = db.session.query(User).filter_by(mail=mail_addr).first()
        if not user:
            raise ValueError("User generated incorrectly")

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
        reset_url = f"{frontend_url}/auth/reset-password?token={raw_token}"

        AuthService._send_email(
            to=user.mail,
            subject="Reset your Kayak Planner password",
            body=(
                f"Hi {user.name},\n\n"
                f"Click the link below to reset your password (valid for 1 hour):\n\n"
                f"{reset_url}\n\n"
                "If you did not request this, ignore this email."
            ),
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
        db.session.commit()
        logger.info(f"Password reset for user {user.username}")
        return user

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _create_token(user_id:UUID, token_type: AuthTokenType) -> str:
        """Generate a raw token, persist its hash, and return the raw value."""
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        expiry_hours = _TOKEN_EXPIRY_HOURS[token_type]
        auth_token = AuthToken()
        auth_token.user_id= user_id
        auth_token.token_hash=token_hash
        auth_token.type=token_type
        auth_token.expires_at=datetime.now(timezone.utc) + timedelta(hours=expiry_hours)
        
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
        verify_url = f"{frontend_url}/auth/verify?token={raw_token}"

        AuthService._send_email(
            to=user.mail,
            subject="Verify your Kayak Planner account",
            body=(
                f"Hi {user.name},\n\n"
                f"Click the link below to activate your account (valid for 24 hours):\n\n"
                f"{verify_url}\n\n"
                "If you did not create this account, ignore this email."
            ),
        )

    @staticmethod
    def _send_email(to: str, subject: str, body: str) -> None:
        try:
            msg = Message(subject=subject, recipients=[to], body=body)
            mail.send(msg)
        except Exception as e:
            # Log but do not surface mail failures to the caller — token is already stored
            logger.error(f"Failed to send email to {to}: {e}")
