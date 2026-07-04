"""M11 §4 — StorageService no longer provisions the bucket/policy on every call.

Bucket creation and the public-read policy are provisioned once by the `minio-init`
compose service; the runtime credential only needs object CRUD. These tests guard
against reintroducing a head_bucket/create_bucket/put_bucket_policy call on the hot path.
"""
from unittest.mock import MagicMock, patch

from Services.storage_service import StorageService

# > MIN_SIZE (512 bytes), valid JPEG magic bytes so `magic.from_buffer` resolves to image/jpeg.
_FAKE_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 600


def test_upload_only_calls_put_object_no_bucket_provisioning():
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.upload(_FAKE_JPEG, "some-key.jpg", "avatar")

    fake_client.put_object.assert_called_once()
    fake_client.head_bucket.assert_not_called()
    fake_client.create_bucket.assert_not_called()
    fake_client.put_bucket_policy.assert_not_called()


def test_upload_export_only_calls_put_object_no_bucket_provisioning():
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.upload_export("some-export-key", b'{"ok": true}')

    fake_client.put_object.assert_called_once()
    fake_client.head_bucket.assert_not_called()
    fake_client.create_bucket.assert_not_called()
    fake_client.put_bucket_policy.assert_not_called()
