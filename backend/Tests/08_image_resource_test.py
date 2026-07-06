"""
Image Resource Tests — point image upload, removal, and visibility toggling via
MinIO-backed storage.

StorageService is mocked throughout: tests verify HTTP behaviour and DB state,
not object storage internals.
"""

from unittest.mock import patch
import io
import json
import pytest

from Resources.point_resource import POINT_ENDPOINT

_FAKE_IMAGE = b"\xff\xd8\xff" + b"X" * 600   # JPEG magic bytes + padding, > 512 B
# Uploads default to the private prefix (Image.is_public=False) — see image_service.upload_for_point.
_MOCK_URL = "http://minio:9000/kayak/point-images-private/fake-uuid"
_MOCK_PRESIGNED_URL = "http://minio:9000/kayak/point-images-private/fake-uuid?presigned=1"
_MOCK_PUBLIC_URL = "http://minio:9000/kayak/point-images/fake-uuid"


@pytest.fixture(scope="function")
def point(client, auth_headers, itinerary):
    """Create a point attached to the first day of the test itinerary."""
    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={
            "dayId": itinerary["days"][0]["id"],
            "type": "position",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "notes": "Test point",
        },
    )
    assert response.status_code == 201
    point_data = json.loads(response.data)

    yield point_data

    try:
        client.delete(f"{POINT_ENDPOINT}/{point_data['id']}", headers=auth_headers)
    except Exception:
        pass


def _upload_image(client, auth_headers, point_id):
    """Upload a fake image to the given point, mocking storage upload/presign."""
    with patch("Services.image_service.StorageService.upload", return_value=_MOCK_URL), \
         patch("Services.image_service.StorageService.delete"), \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        return client.post(
            f"{POINT_ENDPOINT}/{point_id}/images",
            data={"file": (io.BytesIO(_FAKE_IMAGE), "photo.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )


# ============================================================================
# POST /api/point/<id>/images
# ============================================================================

def test_upload_image_to_point(client, auth_headers, point):
    """A valid multipart upload attaches an image to the point, private by default."""
    response = _upload_image(client, auth_headers, point["id"])
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["isPublic"] is False
    # Private images are never dumped with their raw storage location — a presigned URL stands in.
    assert data["location"] == _MOCK_PRESIGNED_URL
    assert data["name"] == "photo.jpg"
    assert data["size"] == len(_FAKE_IMAGE)


def test_upload_image_persists_in_point(client, auth_headers, point):
    """After upload the (presigned) image URL is returned when fetching the point."""
    with patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        _upload_image(client, auth_headers, point["id"])

        response = client.get(f"{POINT_ENDPOINT}/{point['id']}", headers=auth_headers)
    assert response.status_code == 200
    images = json.loads(response.data).get("images", [])
    assert any(img["location"] == _MOCK_PRESIGNED_URL for img in images)


def test_upload_image_no_file_returns_400(client, auth_headers, point):
    """Request without a file field returns 400."""
    response = client.post(
        f"{POINT_ENDPOINT}/{point['id']}/images",
        data={},
        content_type="multipart/form-data",
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_upload_image_storage_validation_error_returns_400(client, auth_headers, point):
    """StorageValidationError (e.g. wrong MIME or size) surfaces as 400."""
    from Services.storage_service import StorageValidationError
    with patch("Services.image_service.StorageService.upload", side_effect=StorageValidationError("bad mime")):
        response = client.post(
            f"{POINT_ENDPOINT}/{point['id']}/images",
            data={"file": (io.BytesIO(_FAKE_IMAGE), "photo.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 400


def test_upload_image_nonexistent_point_returns_404(client, auth_headers):
    """Uploading to a non-existent point returns 404."""
    fake_id = "01952f1a-0000-7000-8000-000000000099"
    with patch("Services.image_service.StorageService.upload", return_value=_MOCK_URL):
        response = client.post(
            f"{POINT_ENDPOINT}/{fake_id}/images",
            data={"file": (io.BytesIO(_FAKE_IMAGE), "photo.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert response.status_code == 404


# ============================================================================
# PATCH /api/point/<id>/images/<image_id>
# ============================================================================

def test_make_image_public(client, auth_headers, point):
    """Toggling isPublic=true moves the object to the public prefix and flips the flag."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.move", return_value=_MOCK_PUBLIC_URL) as mocked_move:
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"isPublic": True},
            headers=auth_headers,
        )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["isPublic"] is True
    # Public images dump their direct location as-is, no presigning.
    assert data["location"] == _MOCK_PUBLIC_URL
    mocked_move.assert_called_once()
    assert mocked_move.call_args.args[1:] == ("image-private", "image")


def test_make_image_private_again(client, auth_headers, point):
    """Toggling isPublic=false moves the object back to the private prefix."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.move", return_value=_MOCK_PUBLIC_URL):
        client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"isPublic": True},
            headers=auth_headers,
        )

    with patch("Services.image_service.StorageService.move", return_value=_MOCK_URL) as mocked_move, \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"isPublic": False},
            headers=auth_headers,
        )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["isPublic"] is False
    assert data["location"] == _MOCK_PRESIGNED_URL
    mocked_move.assert_called_once()
    assert mocked_move.call_args.args[1:] == ("image", "image-private")


def test_toggle_image_visibility_noop_skips_move(client, auth_headers, point):
    """Setting isPublic to its current value does not touch storage."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.move") as mocked_move, \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"isPublic": False},
            headers=auth_headers,
        )
    assert response.status_code == 200
    mocked_move.assert_not_called()


def test_toggle_image_visibility_missing_field_returns_400(client, auth_headers, point):
    """Missing/non-boolean isPublic returns 400."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    response = client.patch(
        f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_toggle_image_visibility_nonexistent_returns_404(client, auth_headers, point):
    """Toggling visibility of a non-existent image returns 404."""
    fake_id = "01952f1a-0000-7000-8000-000000000077"
    response = client.patch(
        f"{POINT_ENDPOINT}/{point['id']}/images/{fake_id}",
        json={"isPublic": True},
        headers=auth_headers,
    )
    assert response.status_code == 404


# ============================================================================
# DELETE /api/point/<id>/images/<image_id>
# ============================================================================

def test_delete_image_from_point(client, auth_headers, point):
    """Deleting an image returns 204 and removes it from the point."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.delete"):
        response = client.delete(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            headers=auth_headers,
        )
    assert response.status_code == 204

    # Confirm the image is gone from the point
    get_response = client.get(f"{POINT_ENDPOINT}/{point['id']}", headers=auth_headers)
    images = json.loads(get_response.data).get("images", [])
    assert all(img["id"] != image_id for img in images)


def test_delete_image_nonexistent_returns_404(client, auth_headers, point):
    """Deleting an image that does not exist returns 404."""
    fake_id = "01952f1a-0000-7000-8000-000000000088"
    with patch("Services.image_service.StorageService.delete"):
        response = client.delete(
            f"{POINT_ENDPOINT}/{point['id']}/images/{fake_id}",
            headers=auth_headers,
        )
    assert response.status_code == 404
