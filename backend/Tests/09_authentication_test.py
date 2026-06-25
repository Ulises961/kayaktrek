import pytest
import jwt
import uuid
import random
from datetime import datetime, timedelta, timezone
from flask import current_app

from Models.user import User
from Services.Middleware.auth_middleware import JWTService
from Api.database import db


class TestJWTService:
    """Test JWT token generation and validation"""

    def test_generate_access_token(self, app):
        """Test access token generation"""
        user_id = "test-uuid-123"
        email = "test@example.com"
        is_admin = False

        token = JWTService.generate_access_token(user_id, email, is_admin, 0)

        assert token is not None
        assert isinstance(token, str)

        # Decode and verify payload
        payload = JWTService.decode_token(token)
        assert payload['user_id'] == user_id
        assert payload['email'] == email
        assert payload['is_admin'] == is_admin
        assert payload['token_type'] == 'access'
        assert 'exp' in payload
        assert 'iat' in payload

    def test_generate_refresh_token(self, app):
        """Test refresh token generation"""
        user_id = "test-uuid-456"

        token = JWTService.generate_refresh_token(user_id, 0)

        assert token is not None
        assert isinstance(token, str)

        # Decode and verify payload
        payload = JWTService.decode_token(token)
        assert payload['user_id'] == user_id
        assert payload['token_type'] == 'refresh'
        assert 'exp' in payload
        assert 'iat' in payload

    def test_decode_valid_token(self, app):
        """Test decoding a valid token"""
        user_id = "test-uuid-789"
        email = "decode@example.com"

        token = JWTService.generate_access_token(user_id, email, False, 0)
        payload = JWTService.decode_token(token)

        assert payload['user_id'] == user_id
        assert payload['email'] == email

    def test_decode_expired_token(self, app):
        """Test decoding an expired token raises ValueError"""
        # Create expired token
        payload = {
            'user_id': 'expired-user',
            'email': 'expired@example.com',
            'is_admin': False,
            'token_type': 'access',
            'iat': datetime.now(timezone.utc) - timedelta(hours=2),
            'exp': datetime.now(timezone.utc) - timedelta(hours=1)
        }

        secret_key = current_app.config['JWT_SECRET_KEY']
        expired_token = jwt.encode(payload, secret_key, algorithm='HS256')

        with pytest.raises(ValueError, match="Token has expired"):
            JWTService.decode_token(expired_token)

    def test_decode_invalid_token(self, app):
        """Test decoding an invalid token raises ValueError"""
        invalid_token = "invalid.token.here"

        with pytest.raises(ValueError, match="Invalid token"):
            JWTService.decode_token(invalid_token)

    def test_verify_token_correct_type(self, app):
        """Test verifying token with correct type"""
        user_id = "verify-user"
        token = JWTService.generate_access_token(user_id, "verify@test.com", False, 0)

        payload = JWTService.verify_token(token, 'access')

        assert payload is not None
        assert payload['user_id'] == user_id
        assert payload['token_type'] == 'access'

    def test_verify_token_wrong_type(self, app):
        """Test verifying token with wrong type returns None"""
        user_id = "wrong-type-user"
        access_token = JWTService.generate_access_token(user_id, "wrong@test.com", False, 0)

        # Try to verify access token as refresh token
        payload = JWTService.verify_token(access_token, 'refresh')

        assert payload is None

    def test_verify_invalid_token(self, app):
        """Test verifying invalid token returns None"""
        payload = JWTService.verify_token("invalid.token", 'access')
        assert payload is None


class TestAuthenticationEndpoints:
    """Test authentication endpoints"""

    def test_register_new_user(self, client):
        """Test registering a new user"""
        new_user_data = {
            "username": f"testuser_{uuid.uuid4().hex[:8]}",
            "mail": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "pwd": "SecurePass123!",
            "phone": f"+123456{random.randint(1000, 9999)}",
            "name": "Test",
            "surname": "User"
        }

        response = client.post('/api/v1/auth/register', json=new_user_data)

        assert response.status_code == 201
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'access_token' not in data
        assert 'refresh_token' not in data

        # Verify user was created
        user = User.query.filter_by(mail=new_user_data['mail']).first()
        assert user is not None
        assert user.username == new_user_data['username']
        assert user.id is not None

    def test_register_duplicate_username(self, client):
        """Test registering with existing username fails"""
        # Create first user
        unique_suffix = uuid.uuid4().hex[:8]
        # Generate numeric-only phone suffix
        phone_suffix = str(hash(unique_suffix) % 10000).zfill(4)
        user_data = {
            "username": f"duplicate_{unique_suffix}",
            "mail": f"first_{unique_suffix}@example.com",
            "pwd": "Password123!",
            "phone": f"+987654{phone_suffix}",
            "name": "First"
        }

        response1 = client.post('/api/v1/auth/register', json=user_data)
        assert response1.status_code == 201

        # Try to register with same username but different email — non-disclosure:
        # the API returns 201 either way so usernames are not enumerable.
        duplicate_data = user_data.copy()
        duplicate_data['mail'] = f"second_{unique_suffix}@example.com"
        duplicate_data['phone'] = f"+111111{phone_suffix}"

        response2 = client.post('/api/v1/auth/register', json=duplicate_data)
        assert response2.status_code == 201

    def test_register_missing_fields(self, client):
        """Test registration with missing required fields"""
        incomplete_data = {
            "username": "incomplete"
            # Missing mail, pwd, phone, name
        }

        response = client.post('/api/v1/auth/register', json=incomplete_data)

        # Should fail validation
        assert response.status_code in [400, 422]

    def test_login_valid_credentials(self, client):
        """Test login with valid credentials"""
        # First register a user
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"loginuser_{unique_suffix}",
            "mail": f"login_{unique_suffix}@example.com",
            "pwd": "LoginPass123!",
            "phone": f"+555555{random.randint(1000, 9999)}",
            "name": "Login"
        }

        register_response = client.post('/api/v1/auth/register', json=user_data)
        assert register_response.status_code == 201

        user = User.query.filter_by(mail=user_data['mail']).first()
        assert user is not None
        user.active = True
        db.session.commit()

        # Now login
        login_data = {
            "mail": user_data['mail'],
            "username": user_data['username'],
            "pwd": user_data['pwd']
        }

        response = client.post('/api/v1/auth/login', json=login_data)

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'access_token' in data
        assert 'refresh_token' in data

        # Verify tokens are valid
        access_payload = JWTService.decode_token(data['access_token'])
        assert access_payload['token_type'] == 'access'

        refresh_payload = JWTService.decode_token(data['refresh_token'])
        assert refresh_payload['token_type'] == 'refresh'

    def test_login_invalid_password(self, client):
        """Test login with wrong password"""
        # Register user
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"wrongpass_{unique_suffix}",
            "mail": f"wrongpass_{unique_suffix}@example.com",
            "pwd": "CorrectPass123!",
            "phone": f"+666666{random.randint(1000, 9999)}",
            "name": "Wrong"
        }

        client.post('/api/v1/auth/register', json=user_data)

        user = User.query.filter_by(mail=user_data['mail']).first()
        assert user is not None

        user.active = True
        db.session.commit()

        # Login with wrong password
        login_data = {
            "mail": user_data['mail'],
            "username": user_data['username'],
            "pwd": "WrongPassword123!"
        }

        response = client.post('/api/v1/auth/login', json=login_data)

        assert response.status_code == 401
        data = response.get_json()
        assert data['status'] == 'fail'

    def test_login_nonexistent_user(self, client):
        """Test login with non-existent user"""
        login_data = {
            "mail": "nonexistent@example.com",
            "username": "nonexistent",
            "pwd": "SomePassword123!"
        }

        response = client.post('/api/v1/auth/login', json=login_data)

        assert response.status_code == 401

    def test_login_missing_body(self, client):
        """Test login with missing request body"""
        response = client.post('/api/v1/auth/login', json=None)

        # Flask returns 415 when Content-Type is not application/json
        assert response.status_code in [400, 415]

    def test_login_deletion_pending_wrong_password_is_generic(self, client):
        """A deletion-pending account must not be disclosed without a valid password.

        Probing with a wrong password returns the same generic 401 as any other
        failure — no deletion_pending oracle for an unauthenticated attacker.
        """
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"delpending_{unique_suffix}",
            "mail": f"delpending_{unique_suffix}@example.com",
            "pwd": "CorrectPass123!",
            "phone": f"+777777{random.randint(1000, 9999)}",
            "name": "Pending",
        }
        client.post('/api/v1/auth/register', json=user_data)
        user = User.query.filter_by(mail=user_data['mail']).first()
        user.active = False
        user.deletion_requested_at = datetime.now(timezone.utc)
        db.session.commit()

        response = client.post('/api/v1/auth/login', json={
            "mail": user_data['mail'],
            "pwd": "WrongPassword123!",
        })

        assert response.status_code == 401
        data = response.get_json()
        assert data['status'] == 'fail'
        assert data.get('code') != 'deletion_pending'

    def test_login_deletion_pending_correct_password_discloses(self, client):
        """The legitimate owner (correct password) still gets the actionable
        deletion_pending signal so they can cancel the pending deletion."""
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"delowner_{unique_suffix}",
            "mail": f"delowner_{unique_suffix}@example.com",
            "pwd": "CorrectPass123!",
            "phone": f"+888888{random.randint(1000, 9999)}",
            "name": "Owner",
        }
        client.post('/api/v1/auth/register', json=user_data)
        user = User.query.filter_by(mail=user_data['mail']).first()
        user.active = False
        user.deletion_requested_at = datetime.now(timezone.utc)
        db.session.commit()

        response = client.post('/api/v1/auth/login', json={
            "mail": user_data['mail'],
            "pwd": user_data['pwd'],
        })

        assert response.status_code == 403
        assert response.get_json().get('code') == 'deletion_pending'

    def test_refresh_token_valid(self, client):
        """Test refreshing access token with valid refresh token"""
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"refreshuser_{unique_suffix}",
            "mail": f"refresh_{unique_suffix}@example.com",
            "pwd": "RefreshPass123!",
            "phone": f"+777777{random.randint(1000, 9999)}",
            "name": "Refresh"
        }
        client.post('/api/v1/auth/register', json=user_data)
        user = User.query.filter_by(mail=user_data['mail']).first()
        assert user is not None
        user.active = True
        db.session.commit()

        login_resp = client.post('/api/v1/auth/login', json={"mail": user_data['mail'], "pwd": user_data['pwd']})
        refresh_token = login_resp.get_json()['refresh_token']

        response = client.post('/api/v1/auth/refresh', json={"refresh_token": refresh_token})

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'access_token' in data
        new_access_payload = JWTService.decode_token(data['access_token'])
        assert new_access_payload['token_type'] == 'access'

    def test_refresh_token_missing(self, client):
        """Test refresh endpoint with missing token"""
        response = client.post('/api/v1/auth/refresh', json={})

        assert response.status_code == 400

    def test_refresh_with_access_token(self, client):
        """Test refresh endpoint with access token instead of refresh token"""
        unique_suffix = uuid.uuid4().hex[:8]
        user_data = {
            "username": f"wrongtoken_{unique_suffix}",
            "mail": f"wrongtoken_{unique_suffix}@example.com",
            "pwd": "WrongToken123!",
            "phone": f"+888888{random.randint(1000, 9999)}",
            "name": "Wrong"
        }
        client.post('/api/v1/auth/register', json=user_data)
        user = User.query.filter_by(mail=user_data['mail']).first()
        assert user is not None
        user.active = True
        db.session.commit()

        login_resp = client.post('/api/v1/auth/login', json={"mail": user_data['mail'], "pwd": user_data['pwd']})
        access_token = login_resp.get_json()['access_token']

        response = client.post('/api/v1/auth/refresh', json={"refresh_token": access_token})

        assert response.status_code == 401

    def test_refresh_with_invalid_token(self, client):
        """Test refresh with completely invalid token"""
        response = client.post('/api/v1/auth/refresh', json={
            "refresh_token": "invalid.token.here"
        })

        assert response.status_code == 401
