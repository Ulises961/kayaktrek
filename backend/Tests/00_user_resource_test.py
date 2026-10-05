from unittest.mock import patch
from uuid import UUID
import base64
import io
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from Api.database import db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT
from Services.crypto_service import decrypt
from Tests.conftest import _keypair_fields


def _public_key_for(private_key_b64: str) -> str:
    """Derive the public half of a base64 X25519 private key, so a stored keypair can
    be checked for coherence rather than merely for presence."""
    private_key = X25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
    return base64.b64encode(private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )).decode()


def test_user_missing_arguments(client):
    new_user_json = {"mail": "test2.user@gmail.com"}
    response = client.post("/api/v1/auth/register", json=new_user_json)
    assert response.status_code == 422


def test_get_user(client, auth_headers, id):
    response = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)['name'] == "Test User"


def test_user_update_name(client, auth_headers, id):
    response = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    user = json.loads(response.data)
    id = str(user["id"])
    user["name"] = "Updated Name"

    response = client.patch(f"{USER_ENDPOINT}/{id}", json=user, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)['id'] == id
    assert json.loads(response.data)['name'] == "Updated Name"


def test_update_user(client, auth_headers, id):
    response = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    originalUser = json.loads(response.data)

    # mail is not patchable via this endpoint — it requires a dedicated flow
    updatedUser = {
        'name': 'Ulises',
        'surname': 'Sosa',
        'username': originalUser['username'],
        'phone': originalUser['phone'],
    }
    response = client.patch(f"{USER_ENDPOINT}/{id}", json=updatedUser, headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['name'] == "Ulises"
    assert data['surname'] == "Sosa"
    assert data['username'] == originalUser['username']
    assert data['phone'] == originalUser['phone']
    assert data['mail'] == originalUser['mail']
    assert data['id'] == originalUser["id"]

    # Persisted, not just echoed back: a fresh GET reflects the same values.
    refetched = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    assert refetched.status_code == 200
    refetched_data = json.loads(refetched.data)
    assert refetched_data['name'] == "Ulises"
    assert refetched_data['surname'] == "Sosa"


def test_update_user_ignores_pwd_field(client):
    """PATCH /user/<id> must not accept a password change via a 'pwd' key.

    Regression test: UserService.update_user used to hash and store a bare
    'pwd' field with none of change_password's safeguards — no current-password
    check, no token_version bump, no session revocation, and (for any user with
    an X25519 keypair) no re-encryption of the private key, which would have
    silently and permanently locked the user out of their own encrypted medical
    notes. Password changes must go through PATCH /me/password only.
    """
    unique = "pwdguard001"
    mail = f"{unique}@example.com"
    original_pwd = "OriginalPass9$"
    reg = client.post("/api/v1/auth/register", json={
        "mail": mail,
        "pwd": original_pwd,
        "phone": "+390000000111",
        "name": "Guard",
        "username": unique,
    })
    assert reg.status_code == 201
    user = User.query.filter_by(mail=mail).first()
    assert user is not None
    user.active = True
    db.session.commit()

    login = client.post("/api/v1/auth/login", json={"mail": mail, "pwd": original_pwd})
    assert login.status_code == 200
    token = login.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    attempted_new_pwd = "AttemptedNew9$"
    patch = client.patch(
        f"{USER_ENDPOINT}/{user.id}",
        headers=headers,
        json={"pwd": attempted_new_pwd, "name": "Guard2"},
    )
    assert patch.status_code == 200
    assert json.loads(patch.data)["name"] == "Guard2"
    assert "pwd" not in json.loads(patch.data)

    # The old password must still work — the pwd field in the body was ignored.
    still_old = client.post("/api/v1/auth/login", json={"mail": mail, "pwd": original_pwd})
    assert still_old.status_code == 200

    # The "new" password from the payload must never have been applied.
    not_new = client.post("/api/v1/auth/login", json={"mail": mail, "pwd": attempted_new_pwd})
    assert not_new.status_code == 401


def test_delete_user_forbidden_for_other_user(client, auth_headers, id_2):
    """User cannot delete another user's account."""
    response = client.delete(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers)
    assert response.status_code == 403


# ============================================================================
# GET /api/user/me
# ============================================================================

# ============================================================================
# POST/GET /api/user/me/keypair
# ============================================================================

_USER_PWD = "testPassword6$"


def _elevated(client, auth_headers):
    token = json.loads(client.post(
        f"{USER_ENDPOINT}/me/re-auth", json={"password": _USER_PWD}, headers=auth_headers,
    ).data)["elevatedToken"]
    return {**auth_headers, "X-Elevated-Token": token}


def test_store_keypair_conflicts_when_one_already_exists(client, auth_headers):
    """A second keypair must never replace the first — every note and every
    leader-shared copy is encrypted under the one already stored."""
    response = client.post(
        f"{USER_ENDPOINT}/me/keypair",
        json=_keypair_fields(_USER_PWD),
        headers=_elevated(client, auth_headers),
    )
    assert response.status_code == 409, (
        "Users registered in tests post a keypair at sign-up; a second call must 409"
    )


def test_store_keypair_missing_field_returns_400(client, auth_headers):
    """A partial keypair is unusable, so it is rejected rather than half-stored."""
    partial = _keypair_fields(_USER_PWD).copy()
    del partial["privateKeyNonce"]
    response = client.post(
        f"{USER_ENDPOINT}/me/keypair",
        json=partial,
        headers=_elevated(client, auth_headers),
    )
    assert response.status_code == 400


def test_store_keypair_requires_elevated_token(client, auth_headers):
    """No password is sent since M22, so the elevated token is the only thing
    establishing that the caller is the account holder."""
    response = client.post(
        f"{USER_ENDPOINT}/me/keypair",
        json=_keypair_fields(_USER_PWD),
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_store_keypair_requires_auth(client):
    """Unauthenticated request is rejected."""
    response = client.post(
        f"{USER_ENDPOINT}/me/keypair",
        json=_keypair_fields(_USER_PWD),
    )
    assert response.status_code in (401, 403)


def test_get_keypair_returns_the_wrapped_private_key(client, auth_headers):
    """The client needs its own wrapped private key to decrypt anything; it is safe to
    hand over because the password that unwraps it never left the device."""
    response = client.get(f"{USER_ENDPOINT}/me/keypair", headers=_elevated(client, auth_headers))
    assert response.status_code == 200
    data = json.loads(response.data)
    assert set(data) == {
        "publicKey", "privateKeyCiphertext", "privateKeyNonce", "privateKeySalt",
    }
    assert all(data.values())
    private_key = decrypt(
        data["privateKeyCiphertext"], data["privateKeyNonce"], data["privateKeySalt"], _USER_PWD,
    )
    assert _public_key_for(private_key) == data["publicKey"]


def test_get_keypair_requires_elevated_token(client, auth_headers):
    response = client.get(f"{USER_ENDPOINT}/me/keypair", headers=auth_headers)
    assert response.status_code == 403


def test_get_me_exposes_has_keypair(client, auth_headers):
    """GET /me includes hasKeypair reflecting whether the keypair is set."""
    response = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "hasKeypair" in data
    assert isinstance(data["hasKeypair"], bool)
    assert data["hasKeypair"] is True  # the client posts a keypair at sign-up

def test_get_me_returns_current_user(client, auth_headers):
    """Authenticated user receives their own profile."""
    response = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "id" in data
    assert "mail" in data
    assert "pwd" not in data


def test_get_me_requires_auth(client):
    """Unauthenticated request to /me is rejected."""
    response = client.get(f"{USER_ENDPOINT}/me")
    assert response.status_code in (401, 403)


# ============================================================================
# GET /api/user/search
# ============================================================================

def test_search_requires_minimum_two_chars(client, auth_headers):
    """Search query shorter than 2 characters returns 400."""
    response = client.get(f"{USER_ENDPOINT}/search?q=t", headers=auth_headers)
    assert response.status_code == 400


def test_search_finds_user_by_email_prefix(client, auth_headers, user_2):
    """Searching by the start of user_2's email returns a result."""
    prefix = user_2.mail[:6]
    response = client.get(f"{USER_ENDPOINT}/search?q={prefix}", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert any(u["mail"] == user_2.mail for u in data)


def test_search_excludes_self(client, auth_headers, user_1):
    """The calling user never appears in their own search results."""
    prefix = user_1.mail[:6]
    response = client.get(f"{USER_ENDPOINT}/search?q={prefix}", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert all(u["mail"] != user_1.mail for u in data)


def test_search_returns_no_password(client, auth_headers, user_2):
    """Search results never expose the password field."""
    prefix = user_2.mail[:4]
    response = client.get(f"{USER_ENDPOINT}/search?q={prefix}", headers=auth_headers)
    assert response.status_code == 200
    for user in json.loads(response.data):
        assert "pwd" not in user


# ============================================================================
# POST /api/user/me/avatar  &  DELETE /api/user/me/avatar
# ============================================================================

_FAKE_AVATAR = b"\xff\xd8\xff" + b"X" * 600  # JPEG magic bytes + padding, > 512 B


def test_upload_avatar_success(client, auth_headers):
    """A valid multipart upload sets avatar_url on the user."""
    with patch("Services.user_service.StorageService.upload",
               return_value="http://minio/avatars/test.jpg"), \
         patch("Services.user_service.StorageService.delete"):
        response = client.post(
            f"{USER_ENDPOINT}/me/avatar",
            data={"file": (io.BytesIO(_FAKE_AVATAR), "avatar.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert json.loads(response.data)["avatarUrl"] == "http://minio/avatars/test.jpg"


def test_upload_avatar_no_file_returns_400(client, auth_headers):
    """Request without a file field returns 400."""
    response = client.post(
        f"{USER_ENDPOINT}/me/avatar",
        data={},
        content_type="multipart/form-data",
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_upload_avatar_storage_validation_error_returns_400(client, auth_headers):
    """StorageValidationError (e.g. wrong MIME type) surfaces as 400."""
    from Services.storage_service import StorageValidationError
    with patch("Services.user_service.StorageService.upload",
               side_effect=StorageValidationError("bad mime")):
        response = client.post(
            f"{USER_ENDPOINT}/me/avatar",
            data={"file": (io.BytesIO(_FAKE_AVATAR), "avatar.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 400


def test_delete_avatar_success(client, auth_headers, id):
    """Deleting the avatar clears avatar_url and returns 204."""
    with patch("Services.user_service.StorageService.upload",
               return_value="http://minio/avatars/test.jpg"), \
         patch("Services.user_service.StorageService.delete") as mock_delete:
        upload_response = client.post(
            f"{USER_ENDPOINT}/me/avatar",
            data={"file": (io.BytesIO(_FAKE_AVATAR), "avatar.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        assert upload_response.status_code == 200

        response = client.delete(f"{USER_ENDPOINT}/me/avatar", headers=auth_headers)
        assert response.status_code == 204
        # The uploaded object is actually removed from storage, not just unlinked in the DB.
        # `id`/`auth_headers` are session-scoped, so the upload above may itself have
        # triggered a delete-old-avatar call if an earlier test in the suite left this
        # user with an avatar — at least one call is the real, order-independent contract.
        assert mock_delete.called

    # avatar_url is actually cleared, both in the DB and as read back through the API.
    user = User.query.filter_by(id=UUID(id)).first()
    assert user is not None
    assert user.avatar_url is None

    me_response = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    assert me_response.status_code == 200
    assert json.loads(me_response.data)["avatarUrl"] is None


# ============================================================================
# POST /api/user/me/banner  &  DELETE /api/user/me/banner
# ============================================================================

_FAKE_BANNER = b"\xff\xd8\xff" + b"X" * 600  # JPEG magic bytes + padding, > 512 B


def test_upload_banner_success(client, auth_headers):
    """A valid multipart upload sets banner_url on the user."""
    with patch("Services.user_service.StorageService.upload",
               return_value="http://minio/banners/test.jpg"), \
         patch("Services.user_service.StorageService.delete"):
        response = client.post(
            f"{USER_ENDPOINT}/me/banner",
            data={"file": (io.BytesIO(_FAKE_BANNER), "banner.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert json.loads(response.data)["bannerUrl"] == "http://minio/banners/test.jpg"


def test_upload_banner_no_file_returns_400(client, auth_headers):
    """Request without a file field returns 400."""
    response = client.post(
        f"{USER_ENDPOINT}/me/banner",
        data={},
        content_type="multipart/form-data",
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_upload_banner_storage_validation_error_returns_400(client, auth_headers):
    """StorageValidationError (e.g. wrong MIME type) surfaces as 400."""
    from Services.storage_service import StorageValidationError
    with patch("Services.user_service.StorageService.upload",
               side_effect=StorageValidationError("bad mime")):
        response = client.post(
            f"{USER_ENDPOINT}/me/banner",
            data={"file": (io.BytesIO(_FAKE_BANNER), "banner.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 400


def test_delete_banner_success(client, auth_headers, id):
    """Deleting the banner clears banner_url and returns 204."""
    with patch("Services.user_service.StorageService.upload",
               return_value="http://minio/banners/test.jpg"), \
         patch("Services.user_service.StorageService.delete") as mock_delete:
        upload_response = client.post(
            f"{USER_ENDPOINT}/me/banner",
            data={"file": (io.BytesIO(_FAKE_BANNER), "banner.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        assert upload_response.status_code == 200

        response = client.delete(f"{USER_ENDPOINT}/me/banner", headers=auth_headers)
        assert response.status_code == 204
        # The uploaded object is actually removed from storage, not just unlinked in the DB.
        # `id`/`auth_headers` are session-scoped, so the upload above may itself have
        # triggered a delete-old-banner call if an earlier test in the suite left this
        # user with a banner — at least one call is the real, order-independent contract.
        assert mock_delete.called

    # banner_url is actually cleared, both in the DB and as read back through the API.
    user = User.query.filter_by(id=UUID(id)).first()
    assert user is not None
    assert user.banner_url is None

    me_response = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    assert me_response.status_code == 200
    assert json.loads(me_response.data)["bannerUrl"] is None
