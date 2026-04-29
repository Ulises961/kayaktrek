from unittest.mock import patch
import io
import json
import uuid

from Resources.user_resource import USER_ENDPOINT

def test_user_missing_arguments(client):
    new_user_json = {"mail": "test2.user@gmail.com"}
    response = client.post("/api/auth/register", json=new_user_json)
    assert response.status_code == 422  # Should fail due to missing required fields

def test_get_user(client, auth_headers, id):
    response = client.get(
        f"{USER_ENDPOINT}/{id}",
        headers=auth_headers)
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
        'pwd': 'testPassword6$',
    }
    response = client.patch(f"{USER_ENDPOINT}/{id}", json=updatedUser, headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['name'] == "Ulises"
    assert data['surname'] == "Sosa"
    assert data['mail'] == originalUser['mail']  # mail unchanged
    assert data['id'] == originalUser["id"]

def test_delete_user_forbidden_for_other_user(client, auth_headers, id_2):
    """User cannot delete another user's account."""
    response = client.delete(
        f"{USER_ENDPOINT}/{id_2}",
        headers=auth_headers)
    assert response.status_code == 403


# ============================================================================
# GET /api/user/me
# ============================================================================

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

_FAKE_AVATAR = b"\xff\xd8\xff" + b"X" * 600   # starts with JPEG magic bytes, > 512 B

def test_upload_avatar_success(client, auth_headers):
    """A valid multipart upload sets avatar_url on the user."""
    with patch("Services.user_service.StorageService.upload", return_value="http://minio/avatars/test.jpg"), \
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
    with patch("Services.user_service.StorageService.upload", side_effect=StorageValidationError("bad mime")):
        response = client.post(
            f"{USER_ENDPOINT}/me/avatar",
            data={"file": (io.BytesIO(_FAKE_AVATAR), "avatar.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 400


def test_delete_avatar_success(client, auth_headers):
    """Deleting the avatar clears avatar_url and returns 204."""
    with patch("Services.user_service.StorageService.upload", return_value="http://minio/avatars/test.jpg"), \
         patch("Services.user_service.StorageService.delete"):
        client.post(
            f"{USER_ENDPOINT}/me/avatar",
            data={"file": (io.BytesIO(_FAKE_AVATAR), "avatar.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        response = client.delete(f"{USER_ENDPOINT}/me/avatar", headers=auth_headers)
    assert response.status_code == 204


