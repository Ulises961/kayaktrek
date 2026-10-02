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
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import urlparse

import pytest

import Resources.user_resource as user_resource
import Services.storage_service as storage_service
import Services.user_service as user_service
from Services.storage_service import StorageService

# > MIN_SIZE (512 bytes), valid JPEG magic bytes so `magic.from_buffer` resolves to image/jpeg.
_FAKE_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 600

_PUBLIC_KINDS = ["avatar", "banner", "image"]
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


# A test asserting cached tiles land in the private bucket used to sit here. Tiles are no
# longer in the object store at all — they are on local disk (Services/tile_cache.py), so
# there is no bucket for them to go to. Coverage moved to Tests/62_m8_tile_proxy_test.py.


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


def _reimport_storage_service():
    """Import a throwaway copy of the module, so its env-read constants are recomputed
    under the current environment without touching the live one.

    Deliberately not `importlib.reload`. Reload re-executes the module *in place*, which
    rebinds `StorageService` and `StorageValidationError` to brand-new class objects —
    while the three resources and four services that did
    `from Services.storage_service import ...` at import time keep the originals. The
    `except StorageValidationError` in `user_resource.upload_avatar` then no longer
    catches the error the service raises, and the request 500s instead of returning 400.
    That poisons the whole worker process, so it surfaced as an apparently unrelated test
    in another file failing, and only when xdist happened to schedule that file after
    this one.

    The copy is never registered in `sys.modules`, so nothing else can pick it up.
    """
    spec = importlib.util.spec_from_file_location(
        "_storage_service_fresh", Path(storage_service.__file__)
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestEmptyStringEnvIsTreatedAsUnset:
    """docker-compose writes `VAR: ${VAR:-}` as an empty string, not an absent key.

    A `get(name, default)` would therefore never fire its default and both bucket roles
    would resolve to `""` — every object written to a nameless bucket. The service reads
    these with `or`, which is what these tests pin.
    """

    def test_empty_bucket_split_vars_fall_back_to_the_single_bucket(self, monkeypatch):
        monkeypatch.setenv("STORAGE_BUCKET", "kayak")
        monkeypatch.setenv("STORAGE_BUCKET_PUBLIC", "")
        monkeypatch.setenv("STORAGE_BUCKET_PRIVATE", "")
        fresh = _reimport_storage_service()

        assert fresh._PUBLIC_BUCKET == "kayak"
        assert fresh._PRIVATE_BUCKET == "kayak"

    def test_empty_endpoint_vars_fall_back_to_the_local_defaults(self, monkeypatch):
        for name in ("STORAGE_ENDPOINT", "STORAGE_PUBLIC_URL", "STORAGE_ACCESS_KEY"):
            monkeypatch.setenv(name, "")
        fresh = _reimport_storage_service()

        assert fresh._ENDPOINT == "http://localhost:9000"
        assert fresh._PUBLIC_URL == "http://localhost:9000"
        assert fresh._ACCESS_KEY == "kayak"

    def test_an_empty_cdn_base_does_not_produce_a_leading_slash_url(self, monkeypatch):
        """`"" or ""` must fall through to the path-style base, not build `/avatars/k.jpg`."""
        monkeypatch.setenv("STORAGE_BUCKET", "kayak")
        monkeypatch.setenv("STORAGE_PUBLIC_BASE_URL", "")
        monkeypatch.setenv("STORAGE_PUBLIC_URL", "http://localhost:9000")
        fresh = _reimport_storage_service()

        fake_client = MagicMock()
        with patch.object(fresh, "_client", return_value=fake_client):
            url = fresh.StorageService.upload(_FAKE_JPEG, "k.jpg", "avatar")

        assert url == "http://localhost:9000/kayak/avatars/k.jpg"

    def test_the_live_module_keeps_its_identity(self):
        """The guard on the above: re-importing must leave the live module alone.

        `except StorageValidationError` in the resources is an identity check against the
        class object they imported at startup, so a helper that mutated the live module
        would silently turn every storage validation error in the process into a 500.
        """
        fresh = _reimport_storage_service()

        assert fresh is not storage_service
        assert fresh.StorageValidationError is not storage_service.StorageValidationError
        assert user_resource.StorageValidationError is storage_service.StorageValidationError
        assert user_service.StorageService is storage_service.StorageService


class TestRegion:
    """R2 validates the SigV4 region against a fixed list and rejects anything else with
    InvalidRegionName — failing every PutObject and every presigned URL.

    A real production break: the region was hardcoded to `eu-south-1`, which MinIO accepts
    (nothing pins MINIO_REGION), so it went unnoticed until the first upload against R2.

    Uses `_reimport_storage_service()` for the same reason everything else in this file
    does — see its docstring above.
    """

    def test_default_region_is_one_r2_accepts(self, monkeypatch):
        monkeypatch.delenv("STORAGE_REGION", raising=False)
        fresh = _reimport_storage_service()

        assert fresh._REGION in {"wnam", "enam", "weur", "eeur", "apac", "oc", "auto"}

    def test_the_region_reaches_the_boto3_client(self, monkeypatch):
        """Asserting the module constant alone would pass even if the client ignored it —
        which is exactly the shape of the original bug, where a hardcoded literal sat in
        the client call and no configuration could reach it.

        Patches the live module rather than reimporting, because the assertion is about
        `_client()` reading `_REGION` at call time, not about how `_REGION` is resolved.
        """
        monkeypatch.setattr(storage_service, "_REGION", "weur")

        client = storage_service._client()

        assert client.meta.region_name == "weur"

    def test_an_empty_region_falls_back_rather_than_signing_with_nothing(self, monkeypatch):
        monkeypatch.setenv("STORAGE_REGION", "")
        fresh = _reimport_storage_service()

        assert fresh._REGION == "auto"
