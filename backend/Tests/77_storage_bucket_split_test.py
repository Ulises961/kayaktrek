"""Two-bucket object storage — the access boundary that used to be a prefix policy.

MinIO scopes anonymous read by *prefix*; Cloudflare R2 scopes it by *bucket*. Moving
production storage to R2 therefore means public and presigned-only objects live in
separate buckets, and the thing these tests guard is that the split lands on the same
boundary the prefix policy drew: avatars and public point images fetchable, everything
else — private point images, documents, GDPR exports, cached tiles — not.

The split is switched on by STORAGE_BUCKET_PUBLIC/STORAGE_BUCKET_PRIVATE. With neither
set, both resolve to STORAGE_BUCKET and every call behaves exactly as it did on a
single-bucket MinIO, which is what local dev and CI still run.
"""
from unittest.mock import MagicMock, patch
from urllib.parse import urlparse

import pytest

import Services.storage_service as storage_service
from Services.storage_service import StorageService

# > MIN_SIZE (512 bytes), valid JPEG magic bytes so `magic.from_buffer` resolves to image/jpeg.
_FAKE_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 600

_PUBLIC_KINDS = ["avatar", "image"]
_PRIVATE_KINDS = ["image-private", "document"]


@pytest.fixture
def split_buckets(monkeypatch):
    """Production shape: two buckets, public one behind a CDN domain at its own root."""
    monkeypatch.setattr(storage_service, "_PUBLIC_BUCKET", "kayak-public")
    monkeypatch.setattr(storage_service, "_PRIVATE_BUCKET", "kayak-private")
    monkeypatch.setattr(storage_service, "_PUBLIC_BASE_URL", "https://cdn.kayaktrek.app")
    monkeypatch.setattr(storage_service, "_PUBLIC_URL", "https://acct.r2.cloudflarestorage.com")


@pytest.mark.parametrize("kind", _PUBLIC_KINDS)
def test_public_kinds_upload_to_the_public_bucket(split_buckets, kind):
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.upload(_FAKE_JPEG, "k.jpg", kind)

    assert fake_client.put_object.call_args.kwargs["Bucket"] == "kayak-public"


@pytest.mark.parametrize("kind", _PRIVATE_KINDS)
def test_private_kinds_never_reach_the_public_bucket(split_buckets, kind):
    """The whole point of the split: a document in the public bucket is world-readable."""
    fake_client = MagicMock()
    payload = _FAKE_JPEG if kind == "image-private" else b"%PDF-1.4\n" + b"\x00" * 600
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.upload(payload, "k", kind)

    assert fake_client.put_object.call_args.kwargs["Bucket"] == "kayak-private"


def test_exports_go_to_the_private_bucket(split_buckets):
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.upload_export("some-export", b'{"ok": true}')

    assert fake_client.put_object.call_args.kwargs["Bucket"] == "kayak-private"


def test_cached_tiles_go_to_the_private_bucket(split_buckets):
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.put_object("tiles/osm/3/4/2.png", b"\x89PNG", "image/png")

    assert fake_client.put_object.call_args.kwargs["Bucket"] == "kayak-private"


def test_public_url_has_no_bucket_segment_when_a_cdn_domain_is_set(split_buckets):
    """An R2 custom domain maps to a bucket at its root, so `host/bucket/key` would 404.

    This is the shape difference that makes the base URL configured whole rather than
    assembled from host + bucket.
    """
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        url = StorageService.upload(_FAKE_JPEG, "k.jpg", "avatar")

    assert url == "https://cdn.kayaktrek.app/avatars/k.jpg"
    assert "kayak-public" not in url


def test_stored_private_url_still_round_trips_to_its_object_key(split_buckets):
    """Private URLs are key carriers, not fetchable links — but the key must survive.

    `object_key_from_url` splits on the prefix rather than the host, which is what lets
    the storage host change under existing rows without orphaning them.
    """
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        url = StorageService.upload(_FAKE_JPEG, "abc-123.jpg", "image-private")

    assert StorageService.object_key_from_url(url, "image-private") == "abc-123.jpg"


def test_presigned_url_signs_against_the_private_bucket(split_buckets):
    fake_client = MagicMock()
    with patch("Services.storage_service._client", return_value=fake_client):
        StorageService.presigned_url("abc-123.jpg", "image-private")

    params = fake_client.generate_presigned_url.call_args.kwargs["Params"]
    assert params["Bucket"] == "kayak-private"
    assert params["Key"] == "point-images-private/abc-123.jpg"


class TestMoveAcrossBuckets:
    """`move()` is the public/private image toggle (M19's isPublic PATCH).

    Under the split its two kinds are in different buckets by construction, so this is
    the one call site where a cross-bucket copy is the normal case rather than an edge.
    """

    def test_private_to_public_copies_from_private_and_writes_to_public(self, split_buckets):
        fake_client = MagicMock()
        with patch("Services.storage_service._client", return_value=fake_client):
            url = StorageService.move("abc-123.jpg", "image-private", "image")

        copy_kwargs = fake_client.copy_object.call_args.kwargs
        assert copy_kwargs["CopySource"] == {
            "Bucket": "kayak-private",
            "Key": "point-images-private/abc-123.jpg",
        }
        assert copy_kwargs["Bucket"] == "kayak-public"
        assert copy_kwargs["Key"] == "point-images/abc-123.jpg"
        assert url == "https://cdn.kayaktrek.app/point-images/abc-123.jpg"

    def test_public_to_private_copies_the_other_way(self, split_buckets):
        fake_client = MagicMock()
        with patch("Services.storage_service._client", return_value=fake_client):
            StorageService.move("abc-123.jpg", "image", "image-private")

        copy_kwargs = fake_client.copy_object.call_args.kwargs
        assert copy_kwargs["CopySource"]["Bucket"] == "kayak-public"
        assert copy_kwargs["Bucket"] == "kayak-private"

    def test_the_original_is_deleted_from_the_bucket_it_actually_came_from(self, split_buckets):
        """Deleting from the destination bucket would leave the source copy behind —
        a private document still readable at its old public URL, or a leaked object
        nothing points at any more."""
        fake_client = MagicMock()
        with patch("Services.storage_service._client", return_value=fake_client):
            StorageService.move("abc-123.jpg", "image", "image-private")

        delete_kwargs = fake_client.delete_object.call_args.kwargs
        assert delete_kwargs["Bucket"] == "kayak-public"
        assert delete_kwargs["Key"] == "point-images/abc-123.jpg"


class TestSingleBucketStaysUnchanged:
    """Local dev, CI, and production until the migration runs. Neither split var is set,
    so both roles resolve to STORAGE_BUCKET and URLs keep their path-style bucket segment."""

    @pytest.fixture(autouse=True)
    def single_bucket(self, monkeypatch):
        monkeypatch.setattr(storage_service, "_PUBLIC_BUCKET", "kayak")
        monkeypatch.setattr(storage_service, "_PRIVATE_BUCKET", "kayak")
        monkeypatch.setattr(storage_service, "_PUBLIC_BASE_URL", "")
        monkeypatch.setattr(storage_service, "_PUBLIC_URL", "http://localhost:9000")

    @pytest.mark.parametrize("kind", _PUBLIC_KINDS + _PRIVATE_KINDS)
    def test_every_kind_uses_the_one_bucket(self, kind):
        fake_client = MagicMock()
        payload = _FAKE_JPEG if kind != "document" else b"%PDF-1.4\n" + b"\x00" * 600
        with patch("Services.storage_service._client", return_value=fake_client):
            StorageService.upload(payload, "k", kind)

        assert fake_client.put_object.call_args.kwargs["Bucket"] == "kayak"

    def test_url_keeps_the_path_style_bucket_segment(self):
        fake_client = MagicMock()
        with patch("Services.storage_service._client", return_value=fake_client):
            url = StorageService.upload(_FAKE_JPEG, "k.jpg", "avatar")

        assert url == "http://localhost:9000/kayak/avatars/k.jpg"

    def test_move_stays_within_the_one_bucket(self):
        fake_client = MagicMock()
        with patch("Services.storage_service._client", return_value=fake_client):
            StorageService.move("abc.jpg", "image", "image-private")

        copy_kwargs = fake_client.copy_object.call_args.kwargs
        assert copy_kwargs["CopySource"]["Bucket"] == "kayak"
        assert copy_kwargs["Bucket"] == "kayak"


def test_endpoint_override_is_read_at_call_time_not_bound_at_definition(monkeypatch):
    """`_client(endpoint=...)` used to default to `_ENDPOINT` as a function default, which
    Python binds once at definition. Any test monkeypatching the module global was
    therefore asserting against a value the code never read."""
    monkeypatch.setattr(storage_service, "_ENDPOINT", "http://patched-host:9000")

    client = storage_service._client()

    assert urlparse(client.meta.endpoint_url).netloc == "patched-host:9000"
