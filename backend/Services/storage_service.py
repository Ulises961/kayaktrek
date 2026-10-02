import logging
import os
from typing import Literal

import boto3
from functools import lru_cache
import magic
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# For user uploads there is intentionally no `get` method: the URL returned by
# `upload()` is a direct MinIO link the frontend uses in <img src> without any
# backend proxy. The backend only owns the write path (upload + delete) and
# presigned URL generation for private objects.
#
# GDPR exports are the one exception (see the `*_export` methods): they are
# server-generated, private (never in the public-read policy), and streamed back
# through the backend so the one-time download token can be enforced — hence a
# read path (`download_export`) exists for them.

_ENDPOINT = os.environ.get("STORAGE_ENDPOINT") or "http://localhost:9000"
_PUBLIC_URL = os.environ.get("STORAGE_PUBLIC_URL") or "http://localhost:9000"
_ACCESS_KEY = os.environ.get("STORAGE_ACCESS_KEY") or "kayak"
_SECRET_KEY = os.environ.get("STORAGE_SECRET_KEY", "")
_BUCKET = os.environ.get("STORAGE_BUCKET") or "kayak"

# SigV4 requires a region in the signing scope even when the backend has no concept of
# regions. MinIO accepts anything here (nothing pins MINIO_REGION in either compose file),
# which is why a hardcoded `eu-south-1` went unnoticed for as long as MinIO was the only
# backend. R2 validates it against a fixed list — wnam, enam, weur, eeur, apac, oc, auto —
# and rejects everything else with InvalidRegionName, failing every PutObject and every
# presigned URL. `auto` is R2's own answer and is equally fine for MinIO, so it is the
# default rather than something each deployment has to remember to set.
_REGION = os.environ.get("STORAGE_REGION") or "auto"

# Two buckets, not one. MinIO scopes anonymous read by *prefix* (`minio-init` runs
# `mc anonymous set download` over avatars/ and point-images/ only); Cloudflare R2 scopes
# it by *bucket*. So directly-fetchable objects and presigned-only objects have to live in
# separate buckets to keep the same access boundary.
#
# Both default to STORAGE_BUCKET, so a single-bucket MinIO — local dev, CI, and production
# until the migration runs — behaves exactly as it did before. The split is switched on by
# setting these two vars, not by a code change.
# `or` rather than a get() default: docker-compose writes `VAR: ${VAR:-}` as an *empty
# string*, not an absent key, so a get() default would never fire and both roles would
# resolve to "" — every object written to a nameless bucket.
_PUBLIC_BUCKET = os.environ.get("STORAGE_BUCKET_PUBLIC") or _BUCKET
_PRIVATE_BUCKET = os.environ.get("STORAGE_BUCKET_PRIVATE") or _BUCKET

# Base URL for objects a browser fetches directly. Configured whole rather than assembled
# from host + bucket, because the two backends disagree on shape: MinIO is path-style
# (`host/bucket/key`) while an R2 custom domain maps to a bucket at its own root
# (`cdn.example.com/key`, no bucket segment). Empty means "derive the MinIO shape".
_PUBLIC_BASE_URL = os.environ.get("STORAGE_PUBLIC_BASE_URL") or ""

# Prefix for GDPR data-export blobs. Deliberately excluded from the public-read policy
# provisioned by minio-init (private) — exports are streamed through the backend behind
# a one-time token.
_EXPORTS_PREFIX = "exports/"

MIN_SIZE = 512
MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_BANNER_SIZE = 8 * 1024 * 1024
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
# SVG deliberately excluded: it's an XML format that can embed <script>, and these
# objects are linked to directly with no backend proxy — an inline-script SVG would
# execute in the storage origin if opened directly. No feature here depends on
# vector images, so raster-only closes off that surface for free.

ALLOWED_DOCUMENT_MIMES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

FileKind = Literal["image", "image-private", "document", "avatar", "banner"]

_KIND_PREFIXES: dict[FileKind, str] = {
    "image": "point-images/",
    # Private point images — on non-public itineraries. Served via presigned_url().
    # Routing to this kind is wired in M1 when the itinerary is_public flag ships.
    "image-private": "point-images-private/",
    "document": "documents/",
    "avatar": "avatars/",
    "banner": "banners/",
}

_KIND_ALLOWED_MIMES: dict[FileKind, set[str]] = {
    "image": ALLOWED_IMAGE_MIMES,
    "image-private": ALLOWED_IMAGE_MIMES,
    "avatar": ALLOWED_IMAGE_MIMES,
    "banner": ALLOWED_IMAGE_MIMES,
    "document": ALLOWED_DOCUMENT_MIMES,
}

_KIND_MAX_SIZE: dict[FileKind, int] = {
    "image": MAX_IMAGE_SIZE,
    "image-private": MAX_IMAGE_SIZE,
    "avatar": MAX_IMAGE_SIZE,
    "banner": MAX_BANNER_SIZE,
    "document": MAX_DOCUMENT_SIZE,
}

BucketRole = Literal["public", "private"]

# Which bucket each kind lives in. This is the access boundary the prefix-scoped MinIO
# policy used to express: avatars and public point images are anonymously readable, the
# rest require a presigned URL.
_KIND_ROLES: dict[FileKind, BucketRole] = {
    "avatar": "public",
    "banner": "public",
    "image": "public",
    "image-private": "private",
    "document": "private",
}


def _bucket(role: BucketRole) -> str:
    return _PUBLIC_BUCKET if role == "public" else _PRIVATE_BUCKET


def _bucket_for(kind: FileKind) -> str:
    return _bucket(_KIND_ROLES[kind])


def _base_url(role: BucketRole) -> str:
    """Base URL that `{base}/{key}` appends to.

    Read at call time rather than computed at import, so tests can monkeypatch the
    module globals and see the effect.
    """
    if role == "public" and _PUBLIC_BASE_URL:
        return _PUBLIC_BASE_URL.rstrip("/")
    return f"{_PUBLIC_URL.rstrip('/')}/{_bucket(role)}"


def _url_for(kind: FileKind, key: str) -> str:
    """The URL stored in the DB for an object of this kind.

    For public kinds this is a real fetchable URL. For private kinds nothing can fetch it
    without a signature — it is stored as a stable carrier for the object key, which
    `object_key_from_url()` recovers by splitting on the *prefix*, so the host and bucket
    in it are incidental.
    """
    return f"{_base_url(_KIND_ROLES[kind])}/{key}"


def public_asset_url(key: str) -> str:
    """
    Absolute URL for a static asset served straight from the public bucket, or "" when
    there is no CDN base configured.

    Unlike `_url_for`, this is for objects that are not user uploads and have no
    `FileKind` — currently just the brand mark that transactional email embeds, under
    `brand/`.

    The empty return is the point. R2 scopes anonymous read per *bucket*, so `brand/`
    is readable there for free; MinIO scopes it per *prefix* and `brand/` is not in the
    policy minio-init provisions, so the same URL would resolve and then 403. Returning
    "" without a CDN base means a local/MinIO environment renders no image at all rather
    than a broken one — the same "omit rather than fake" rule the mail footer follows for
    an unset sender.
    """
    if not _PUBLIC_BASE_URL:
        return ""
    return f"{_base_url('public')}/{key}"


@lru_cache(maxsize=8)
def _build_client(endpoint: str, access_key: str, secret_key: str, region: str):
    """One client per endpoint, reused.

    A fresh boto3 client per operation costs a TLS handshake on every upload. Against a
    MinIO on the same Docker network that was free; against R2 it is a round trip to
    Cloudflare added to a request that is already slow because it is store-and-forward over
    a residential uplink. botocore clients are thread-safe for calls, so sharing one is
    safe under gunicorn's sync workers.

    Every value the client captures is part of the cache key, not just the endpoint —
    keying on the endpoint alone would hand back a client built with the previous region or
    credentials, so a test monkeypatching `_REGION` would assert against a client that never
    saw it. That is the same trap the region test was written to catch one level up.
    `_client()` resolves the globals and passes them in, so this function reads none.
    """
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name=region,
    )


def _client(endpoint: str | None = None):
    # `endpoint or _ENDPOINT` rather than a default argument: a default is bound once at
    # definition time, so `monkeypatch.setattr(storage_service, "_ENDPOINT", ...)` in a
    # test would set a value this function never reads.
    return _build_client(endpoint or _ENDPOINT, _ACCESS_KEY, _SECRET_KEY, _REGION)


# Only avatars and public point images are directly accessible. documents/,
# point-images-private/, exports/ and the tile cache are not — objects there require a
# presigned URL (StorageService.presigned_url) or are streamed back through the backend.
#
# How that boundary is enforced depends on the backend:
#   - MinIO (local dev, CI): one bucket, anonymous read set per *prefix* by the
#     `minio-init` compose service (mc mb + mc anonymous set download).
#   - R2 (production, once migrated): two buckets, since R2 scopes public access per
#     *bucket*. Provisioned in the Cloudflare dashboard, with the public one behind a
#     custom domain.
# Either way it is provisioned once, out of band — not by the app at request time (M11 §4).
# The runtime credential only needs object CRUD, not bucket-policy-write, and a
# bucket-existence check no longer costs an extra round-trip on every upload.
#
# The tile cache used to live here too, in the private bucket. It does not any more — see
# Services/tile_cache.py. The short version: the proxy reads tile bytes into Flask and
# re-serves them, so the browser never fetches them from the object store and R2's free
# egress bought nothing, while every cache *hit* paid a WAN round trip. Tiles are also the
# only objects here with no durability requirement at all.


class StorageValidationError(ValueError):
    pass


class StorageService:
    @staticmethod
    def upload(file_bytes: bytes, object_key: str, kind: FileKind) -> str:
        """
        Validate and upload a file. Returns the public URL.

        Raises StorageValidationError on size or MIME violations.
        """
        size = len(file_bytes)
        if size < MIN_SIZE:
            raise StorageValidationError(
                f"File is too small ({size} bytes). Minimum is {MIN_SIZE} bytes."
            )

        max_size = _KIND_MAX_SIZE[kind]
        if size > max_size:
            raise StorageValidationError(
                f"File exceeds the {max_size // (1024 * 1024)} MB limit."
            )

        mime = magic.from_buffer(file_bytes, mime=True)
        allowed = _KIND_ALLOWED_MIMES[kind]
        if mime not in allowed:
            raise StorageValidationError(
                f"File type '{mime}' is not allowed for {kind} uploads."
            )

        prefix = _KIND_PREFIXES[kind]
        key = f"{prefix}{object_key}"

        client = _client()

        client.put_object(
            Bucket=_bucket_for(kind),
            Key=key,
            Body=file_bytes,
            ContentType=mime,
        )

        logger.info("Uploaded %s (%d bytes, %s)", key, size, mime)
        return _url_for(kind, key)

    @staticmethod
    def delete(object_key: str, kind: FileKind) -> None:
        """Delete a file from storage. Silently succeeds if the key does not exist."""
        prefix = _KIND_PREFIXES[kind]
        key = f"{prefix}{object_key}"
        client = _client()
        try:
            client.delete_object(Bucket=_bucket_for(kind), Key=key)
            logger.info("Deleted %s", key)
        except ClientError as e:
            logger.warning("Could not delete %s: %s", key, e)

    @staticmethod
    def presigned_url(object_key: str, kind: FileKind, expires_in: int = 3600) -> str:
        """Generate a presigned GET URL (useful for private objects).

        Signed against STORAGE_PUBLIC_URL, not STORAGE_ENDPOINT (which
        `upload`/`delete`/`move` use to reach MinIO over the internal docker
        network, e.g. `http://minio:9000`). SigV4 query-signing covers the
        Host, so the URL must be generated against the same host the browser
        will actually request — otherwise the signature is valid for a host
        the browser can never resolve, and every private image 404s/hangs.
        """
        prefix = _KIND_PREFIXES[kind]
        key = f"{prefix}{object_key}"
        client = _client(_PUBLIC_URL)
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket_for(kind), "Key": key},
            ExpiresIn=expires_in,
        )

    @staticmethod
    def object_key_from_url(url: str, kind: FileKind) -> str:
        """Recover the raw object key from a URL previously returned by upload()/move()."""
        prefix = _KIND_PREFIXES[kind]
        return url.split(f"/{prefix}")[-1]

    @staticmethod
    def move(object_key: str, from_kind: FileKind, to_kind: FileKind) -> str:
        """Copy an object to a different kind's prefix and delete the original.

        Returns the new URL (as upload() would have returned for to_kind).

        Under the two-bucket split this is usually a **cross-bucket** copy, because the
        one caller that uses it is the public/private image toggle — and public and
        private are exactly what the buckets separate. `copy_object` handles that, but
        both sides must name their own bucket: passing the destination bucket as the
        CopySource would silently copy the wrong object or 404.
        """
        from_key = f"{_KIND_PREFIXES[from_kind]}{object_key}"
        to_key = f"{_KIND_PREFIXES[to_kind]}{object_key}"
        from_bucket = _bucket_for(from_kind)
        to_bucket = _bucket_for(to_kind)

        client = _client()
        client.copy_object(
            Bucket=to_bucket,
            CopySource={"Bucket": from_bucket, "Key": from_key},
            Key=to_key,
        )
        client.delete_object(Bucket=from_bucket, Key=from_key)

        logger.info("Moved %s/%s -> %s/%s", from_bucket, from_key, to_bucket, to_key)
        return _url_for(to_kind, to_key)

    # -- GDPR data exports ----------------------------------------------------
    # Server-generated blobs shared across containers/replicas via object storage
    # (local disk fails the moment the worker and web run in separate containers).

    @staticmethod
    def upload_export(object_key: str, data: bytes) -> None:
        """Store a GDPR export blob privately. No MIME/size validation — the
        payload is server-generated JSON, not a user upload."""
        client = _client()
        client.put_object(
            Bucket=_PRIVATE_BUCKET,
            Key=f"{_EXPORTS_PREFIX}{object_key}",
            Body=data,
            ContentType="application/json",
        )
        logger.info("Uploaded export %s (%d bytes)", object_key, len(data))

    @staticmethod
    def download_export(object_key: str) -> bytes | None:
        """Return an export blob's bytes, or None if it does not exist."""
        client = _client()
        try:
            obj = client.get_object(Bucket=_PRIVATE_BUCKET, Key=f"{_EXPORTS_PREFIX}{object_key}")
            return obj["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                return None
            raise

    @staticmethod
    def delete_export(object_key: str) -> None:
        """Delete an export blob. Silently succeeds if the key does not exist."""
        client = _client()
        try:
            client.delete_object(Bucket=_PRIVATE_BUCKET, Key=f"{_EXPORTS_PREFIX}{object_key}")
            logger.info("Deleted export %s", object_key)
        except ClientError as e:
            logger.warning("Could not delete export %s: %s", object_key, e)
