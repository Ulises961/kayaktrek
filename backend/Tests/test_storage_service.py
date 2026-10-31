from urllib.parse import urlparse

import Services.storage_service as storage_service
from Services.storage_service import StorageService

# The bug this guards against: STORAGE_ENDPOINT (e.g. http://minio:9000) is the
# internal docker-network host the backend uses to reach MinIO, while
# STORAGE_PUBLIC_URL (e.g. http://localhost:9000) is what a browser can
# actually resolve. A presigned URL generated against STORAGE_ENDPOINT embeds
# and signs a Host the browser can never reach — every private image request
# would hang/fail. See docs/adr or the M7d plan for the incident writeup.


def test_presigned_url_is_signed_against_the_public_endpoint(monkeypatch):
    monkeypatch.setattr(storage_service, "_ENDPOINT", "http://minio:9000")
    monkeypatch.setattr(storage_service, "_PUBLIC_URL", "http://localhost:9000")

    url = StorageService.presigned_url("fake-uuid", "image-private")

    assert urlparse(url).netloc == "localhost:9000"


def test_presigned_url_does_not_leak_the_internal_endpoint_host(monkeypatch):
    monkeypatch.setattr(storage_service, "_ENDPOINT", "http://minio:9000")
    monkeypatch.setattr(storage_service, "_PUBLIC_URL", "http://localhost:9000")

    url = StorageService.presigned_url("fake-uuid", "image-private")

    assert "minio" not in url
