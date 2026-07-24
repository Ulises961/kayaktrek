from functools import wraps
from http import HTTPStatus
import jwt
from werkzeug.exceptions import HTTPException
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict
from flask import current_app, abort, g, request
from Services.user_service import UserService

class JWTService:

    @staticmethod
    def generate_token(payload: Dict[str, Any]) -> str:
        secret_key = current_app.config['JWT_SECRET_KEY']
        token = jwt.encode(payload, secret_key, algorithm='HS256')
        return token

    @staticmethod
    def generate_access_token(user_id: str, email: str, is_admin: bool, token_version: int) -> str:
        payload = {
            'user_id': str(user_id),
            'email': email,
            'is_admin': is_admin,
            'token_type': 'access',
            'tv': token_version,
            'iat': datetime.now(timezone.utc),
            'exp': datetime.now(timezone.utc) + timedelta(minutes=15),
        }
        return JWTService.generate_token(payload)

    @staticmethod
    def generate_refresh_token(user_id: str, token_version: int, refresh_token_version: int) -> str:
        payload = {
            'user_id': str(user_id),
            'token_type': 'refresh',
            'tv': token_version,
            'rtv': refresh_token_version,
            'iat': datetime.now(timezone.utc),
            'exp': datetime.now(timezone.utc) + timedelta(days=30),
        }
        return JWTService.generate_token(payload)

    @staticmethod
    def decode_token(token: str) -> Dict:
        """Decodes a JWT token and returns the payload if valid."""
        secret_key = current_app.config['JWT_SECRET_KEY']
        try:
            payload = jwt.decode(token, secret_key, algorithms=['HS256'])
            return payload
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired")
        except jwt.InvalidTokenError:
            raise ValueError("Invalid token")
        
    @staticmethod
    def verify_token(token: str, token_type: str = 'access') -> Optional[Dict]:
        """
        Verify token and check its type.
        
        Args:
            token: JWT token string
            token_type: Expected token type ('access' or 'refresh')
            
        Returns:
            Decoded payload if valid, None otherwise
        """
        try:
            payload = JWTService.decode_token(token)
            if not payload:
                raise ValueError("Failed token decoding")
            
            if payload.get('token_type') != token_type:
                return None
                
            return payload
        except ValueError:
            return None
        
    @staticmethod
    def generate_elevated_token(user_id: str) -> str:
        """Short-lived token (5 min) gating sensitive data access and destructive actions.
        Guards against session hijacking. Upgrades to TOTP when MFA is introduced."""
        payload = {
            'user_id': str(user_id),
            'purpose': 'sensitive_access',
            'token_type': 'elevated',
            'iat': datetime.now(timezone.utc),
            'exp': datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        return JWTService.generate_token(payload)

    @staticmethod
    def require_elevated_token(f):
        """Decorator: verifies X-Elevated-Token header carries a valid elevated JWT
        issued for the same user as the active session."""
        @wraps(f)
        def decorator(*args, **kwargs):
            token = request.headers.get("X-Elevated-Token")
            if not token:
                abort(HTTPStatus.FORBIDDEN, description="Re-authentication required")
            try:
                payload = JWTService.decode_token(token)
                if payload.get("token_type") != "elevated" or payload.get("purpose") != "sensitive_access":
                    abort(HTTPStatus.FORBIDDEN, description="Invalid elevated token")
                if str(payload.get("user_id")) != str(g.current_user_id):
                    abort(HTTPStatus.FORBIDDEN, description="Elevated token user mismatch")
            except ValueError:
                abort(HTTPStatus.FORBIDDEN, description="Elevated token expired or invalid")
            return f(*args, **kwargs)
        return decorator

    @staticmethod
    def resolve_user_id_from_bearer_header() -> Optional[str]:
        """Verify the current request's Authorization header exactly as
        `authenticate_restful` does, but return the user id (or None) instead of
        aborting/setting `g`. For routes that must also succeed with no header at
        all (M8's SSE stream route accepts either an access token or a stream
        ticket) — never a substitute for `authenticate_restful` on a route that
        actually requires auth."""
        auth_header = request.headers.get("Authorization", None)
        if not auth_header:
            return None
        try:
            token = auth_header.split(" ")[1] if auth_header.startswith("Bearer ") else auth_header
            data = JWTService.verify_token(token)
            if not data:
                return None
            user = UserService.get_user_by_id(data["user_id"])
            if not user or not user.active:
                return None
            iat = data.get("iat")
            if iat and user.password_changed_at:
                token_issued_at = datetime.fromtimestamp(iat, tz=timezone.utc)
                if token_issued_at < user.password_changed_at:
                    return None
            if data.get("tv") != user.token_version:
                return None
            return str(user.id)
        except Exception:
            return None

    @staticmethod
    def authenticate_restful(f):
        @wraps(f)
        def decorator(*args, **kwargs):
            auth_header = request.headers.get("Authorization", None)
            if not auth_header:
                abort(HTTPStatus.UNAUTHORIZED, description="Valid token missing")
            try:
                    # Extract token from "Bearer <token>" format
                    if auth_header.startswith("Bearer "):
                        token = auth_header.split(" ")[1]
                    else:
                        token = auth_header
                    
                    data = JWTService.verify_token(token)
                    if not data:
                        abort(401, description="Invalid token")
                    
                    user = UserService.get_user_by_id(data["user_id"])

                    if not user:
                        return abort(HTTPStatus.UNAUTHORIZED)

                    if not user.active:
                        abort(HTTPStatus.FORBIDDEN, description="Account not yet activated — check your email")

                    iat = data.get("iat")
                    if iat and user.password_changed_at:
                        token_issued_at = datetime.fromtimestamp(iat, tz=timezone.utc)
                        if token_issued_at < user.password_changed_at:
                            abort(HTTPStatus.UNAUTHORIZED, description="Token invalidated by password change — please log in again")

                    if data.get("tv") != user.token_version:
                        abort(HTTPStatus.UNAUTHORIZED, description="Session invalidated — please log in again")

                    g.current_user_mail = user.mail
                    g.current_user_id = str(user.id)

            except HTTPException:
                raise
            except Exception:
                abort(HTTPStatus.UNAUTHORIZED, description="Invalid token")

            return f(*args, **kwargs)
        # Marks this decorator as one that populates g.current_user_id. The
        # auth-invariant canary test relies on this tag to distinguish routes
        # that legitimately read the current user from a silent auth gap.
        decorator._populates_current_user = True
        return decorator

    @staticmethod
    def authenticate_optional(f):
        """Populate g.current_user_id from a valid token when present, otherwise proceed
        unauthenticated. Never aborts on missing or invalid credentials — the view decides
        what an anonymous caller may see.

        g.current_user_id is reset to None up front so the result depends only on this
        request's headers, never on an ambient value left over from a prior request sharing
        the same application context."""
        @wraps(f)
        def decorator(*args, **kwargs):
            g.current_user_id = None
            g.current_user_mail = None
            auth_header = request.headers.get("Authorization", None)
            if auth_header:
                try:
                    token = auth_header.split(" ")[1] if auth_header.startswith("Bearer ") else auth_header
                    data = JWTService.verify_token(token)
                    if data:
                        user = UserService.get_user_by_id(data["user_id"])
                        if user and user.active:
                            iat = data.get("iat")
                            pwd_invalidated = (
                                iat is not None
                                and user.password_changed_at is not None
                                and datetime.fromtimestamp(iat, tz=timezone.utc) < user.password_changed_at
                            )
                            tv_invalidated = data.get("tv") != user.token_version
                            if not pwd_invalidated and not tv_invalidated:
                                g.current_user_mail = user.mail
                                g.current_user_id = str(user.id)
                except Exception:
                    pass  # malformed/invalid token → remain unauthenticated
            return f(*args, **kwargs)
        decorator._populates_current_user = True
        return decorator

   
    
