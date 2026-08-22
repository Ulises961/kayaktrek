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
from uuid import UUID

from Api.database import db as _db
from Models.image import Image
from Models.point_has_image import PointHasImage
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
# PATCH caption (M19 §2)
# ============================================================================

def test_set_caption(client, auth_headers, point):
    """A caption says what the photo shows; Image.name stays the upload filename."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"caption": "Parking above the slipway"},
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json["caption"] == "Parking above the slipway"
    assert response.json["name"] == "photo.jpg"


def test_caption_can_be_cleared(client, auth_headers, point):
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]
    url = f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}"

    with patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        client.patch(url, json={"caption": "Something"}, headers=auth_headers)
        response = client.patch(url, json={"caption": None}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json["caption"] is None


def test_caption_and_visibility_apply_in_one_request(client, auth_headers, point, app):
    """Both fields in one body — a caption change must not silently drop the toggle."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.move", return_value=_MOCK_URL), \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"caption": "Shingle beach at low water", "isPublic": True},
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json["caption"] == "Shingle beach at low water"
    assert response.json["isPublic"] is True

    with app.app_context():
        stored = _db.session.get(Image, UUID(image_id))
        assert stored.caption == "Shingle beach at low water"
        assert stored.is_public is True


def test_caption_over_300_chars_returns_400(client, auth_headers, point):
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    response = client.patch(
        f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
        json={"caption": "x" * 301},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_caption_is_stripped_of_markup(client, auth_headers, point):
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        response = client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"caption": "  <b>Slipway</b> at Cala Verde  "},
            headers=auth_headers,
        )
    assert response.status_code == 200
    stored = response.json["caption"]
    assert "<" not in stored and ">" not in stored
    assert stored == "Slipway at Cala Verde"


def test_public_shape_carries_the_caption_but_never_the_filename(
    client, auth_headers, point, itinerary
):
    """The gallery needs the caption; Image.name is upload metadata the author never
    wrote and can carry a real name or a location, so it stays private."""
    upload = _upload_image(client, auth_headers, point["id"])
    image_id = json.loads(upload.data)["id"]

    with patch("Services.image_service.StorageService.move", return_value=_MOCK_URL), \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        client.patch(
            f"{POINT_ENDPOINT}/{point['id']}/images/{image_id}",
            json={"caption": "Parking above the slipway", "isPublic": True},
            headers=auth_headers,
        )
    client.patch(
        f"/api/v1/itinerary/{itinerary['id']}",
        json={"isPublic": True},
        headers=auth_headers,
    )

    # Anonymous — no credentials at all.
    response = client.get(f"/api/v1/itinerary/{itinerary['id']}/public")
    assert response.status_code == 200
    images = [
        image
        for day in response.json["days"]
        for pt in day["points"]
        for image in pt["images"]
    ]
    assert len(images) == 1
    assert images[0]["caption"] == "Parking above the slipway"
    assert "name" not in images[0]
    assert set(images[0]) == {"url", "caption"}


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


# ============================================================================
# Cascade delete behavior (rubric 4: explicit cascade/constraint testing)
# ============================================================================

def test_cascade_delete_point_deletes_images(client, auth_headers, point, app):
    """Deleting a point cascades to delete its images (verify via DB query)."""
    point_id = point["id"]

    # Upload an image to the point
    with patch("Services.image_service.StorageService.upload", return_value=_MOCK_URL), \
         patch("Services.image_service.StorageService.delete"), \
         patch("Schemas.image_schema.StorageService.presigned_url", return_value=_MOCK_PRESIGNED_URL):
        upload_resp = client.post(
            f"{POINT_ENDPOINT}/{point_id}/images",
            data={"file": (io.BytesIO(_FAKE_IMAGE), "photo.jpg")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
    assert upload_resp.status_code == 201
    image_data = json.loads(upload_resp.data)
    image_id = image_data["id"]

    # Verify the image exists in the DB, attached to the point via the
    # point_has_image junction table (Image has no direct point_id column).
    with app.app_context():
        image = _db.session.query(Image).filter_by(id=UUID(image_id)).first()
        assert image is not None, "Image should exist after upload"
        junction_row = _db.session.execute(
            _db.select(PointHasImage).where(
                PointHasImage.c.point_id == UUID(point_id),
                PointHasImage.c.image_id == UUID(image_id),
            )
        ).first()
        assert junction_row is not None, "Image should be linked to the point"

    # Delete the point
    delete_resp = client.delete(f"{POINT_ENDPOINT}/{point_id}", headers=auth_headers)
    assert delete_resp.status_code == 200

    # Verify the image is cascade-deleted from the DB
    with app.app_context():
        image = _db.session.query(Image).filter_by(id=UUID(image_id)).first()
        assert image is None, "Image should be cascade-deleted when point is deleted"
