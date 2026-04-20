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
    def generate_access_token(user_id: str, email: str, is_admin: bool) -> str:
        """Generates a JWT token with an expiration time."""
        payload = {
            'user_id': str(user_id),
            'email': email,
            'is_admin': is_admin,
            'token_type': 'access',
            'iat': datetime.now(timezone.utc),
            'exp':  datetime.now(timezone.utc) + timedelta(minutes=15) 
        }
        return JWTService.generate_token(payload)    

    @staticmethod
    def generate_refresh_token(user_id: str)-> str:
        payload = {
            'user_id': str(user_id),
            'token_type': 'refresh',
            'iat': datetime.now(timezone.utc),
            'exp':  datetime.now(timezone.utc) + timedelta(days=30)
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

                    g.current_user_mail = user.mail
                    g.current_user_id = str(user.id)

            except HTTPException:
                raise
            except Exception:
                abort(HTTPStatus.UNAUTHORIZED, description="Invalid token")
        
            return f(*args, **kwargs)
        return decorator

   
    
