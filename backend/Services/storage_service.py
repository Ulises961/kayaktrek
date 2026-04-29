import logging
import os
from typing import Literal

import boto3
import magic
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# There is intentionally no `get` method here. The URL returned by `upload()`
# is a direct MinIO link; the frontend uses it in <img src> without any backend
# proxy. The backend only owns the write path (upload + delete) and presigned
# URL generation for private objects.

_ENDPOINT = os.environ.get("STORAGE_ENDPOINT", "http://localhost:9000")
_PUBLIC_URL = os.environ.get("STORAGE_PUBLIC_URL", "http://localhost:9000")
_ACCESS_KEY = os.environ.get("STORAGE_ACCESS_KEY", "kayak")
_SECRET_KEY = os.environ.get("STORAGE_SECRET_KEY", "")
_BUCKET = os.environ.get("STORAGE_BUCKET", "kayak")

MIN_SIZE = 512
MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"}

ALLOWED_DOCUMENT_MIMES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

FileKind = Literal["image", "document", "avatar"]

_KIND_PREFIXES: dict[FileKind, str] = {
    "image": "point-images/",
    "document": "documents/",
    "avatar": "avatars/",
}

_KIND_ALLOWED_MIMES: dict[FileKind, set[str]] = {
    "image": ALLOWED_IMAGE_MIMES,
    "avatar": ALLOWED_IMAGE_MIMES,
    "document": ALLOWED_DOCUMENT_MIMES,
}

_KIND_MAX_SIZE: dict[FileKind, int] = {
    "image": MAX_IMAGE_SIZE,
    "avatar": MAX_IMAGE_SIZE,
    "document": MAX_DOCUMENT_SIZE,
}


def _client():
    return boto3.client(
        "s3",
        endpoint_url=_ENDPOINT,
        aws_access_key_id=_ACCESS_KEY,
        aws_secret_access_key=_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="eu-south-1",
    )


def _ensure_bucket(client) -> None:
    try:
        client.head_bucket(Bucket=_BUCKET)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=_BUCKET)
            logger.info("Created storage bucket '%s'", _BUCKET)
        else:
            raise


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
        _ensure_bucket(client)

        client.put_object(
            Bucket=_BUCKET,
            Key=key,
            Body=file_bytes,
            ContentType=mime,
        )

        logger.info("Uploaded %s (%d bytes, %s)", key, size, mime)
        return f"{_PUBLIC_URL.rstrip('/')}/{_BUCKET}/{key}"

    @staticmethod
    def delete(object_key: str, kind: FileKind) -> None:
        """Delete a file from storage. Silently succeeds if the key does not exist."""
        prefix = _KIND_PREFIXES[kind]
        key = f"{prefix}{object_key}"
        client = _client()
        try:
            client.delete_object(Bucket=_BUCKET, Key=key)
            logger.info("Deleted %s", key)
        except ClientError as e:
            logger.warning("Could not delete %s: %s", key, e)

    @staticmethod
    def presigned_url(object_key: str, kind: FileKind, expires_in: int = 3600) -> str:
        """Generate a presigned GET URL (useful for private objects)."""
        prefix = _KIND_PREFIXES[kind]
        key = f"{prefix}{object_key}"
        client = _client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
