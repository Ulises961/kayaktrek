"""
File upload attack surface — S6.

Verifies that file uploads are validated server-side before any object is
written to storage. Validation is enforced inside StorageService.upload(),
which runs before the MinIO network call, so tests for invalid payloads do
not require MinIO to be running.

§1  Point image upload (POST /api/point/<id>/images)
      - Too small (< 512 B) → 400
      - Too large (> 5 MB) → 400
      - MIME spoofing: PHP bytes, Content-Type: image/jpeg → 400
        (server uses python-magic on raw bytes, ignores Content-Type header)
      - HTML bytes → 400
      - No file field in multipart → 400
      - File field with no filename → 400
      - Double extension shell.php.jpg with PHP bytes → 400
      - Filename is metadata-only; object key is UUID7 — no path traversal risk

§2  Travel-document attachment upload (POST /api/travel-document/<id>/attachment)
      - Too small → 400
      - Too large (> 10 MB) → 400
      - MIME spoofing: PHP bytes, Content-Type: application/pdf → 400
      - Image bytes sent as document (JPEG → not in ALLOWED_DOCUMENT_MIMES) → 400
      - No file field → 400
      - Path traversal filename: raw filename is embedded in the object key;
        any '..' component in the resulting key is a vulnerability — asserted absent.
"""
import io
import json
from unittest.mock import patch

import pytest

from Resources.point_resource import POINT_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT

# ---------------------------------------------------------------------------
# Byte fixtures — magic-bytes-correct or intentionally wrong
# ---------------------------------------------------------------------------

# Valid JPEG: SOI marker (FF D8 FF) + enough padding to pass MIN_SIZE
_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"X" * 600

# Oversized payloads (one byte above each limit)
_OVERSIZE_IMAGE    = b"\xff\xd8\xff\xe0" + b"X" * (5 * 1024 * 1024 + 1)
_OVERSIZE_DOCUMENT = b"%PDF-1.4 " + b"X" * (10 * 1024 * 1024 + 1)

# Valid PDF header + padding
_PDF_BYTES = b"%PDF-1.4 fake content to exceed MIN_SIZE " + b"X" * 600

# Malicious payloads — wrong magic bytes
_PHP_BYTES  = b"<?php system($_GET['cmd']); ?>" + b" " * 600
_HTML_BYTES = b"<html><script>alert(1)</script></html>" + b" " * 600


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def point(client, auth_headers, itinerary):
    """A point on the first day of the session itinerary."""
    r = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={
            "dayId": itinerary["days"][0]["id"],
            "type": "interest",
            "latitude": 44.4,
            "longitude": 8.9,
            "notes": "upload test point",
        },
    )
    assert r.status_code == 201, r.data
    data = json.loads(r.data)
    yield data
    client.delete(f"{POINT_ENDPOINT}/{data['id']}", headers=auth_headers)


@pytest.fixture(scope="function")
def travel_doc(client, auth_headers, trip_w_o_itinerary):
    """A travel document on an owned trip."""
    trip_id = trip_w_o_itinerary["id"]
    r = client.post(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
        headers=auth_headers,
        json={"type": "accommodation", "name": "Upload-test hotel"},
    )
    assert r.status_code == 201, r.data
    data = json.loads(r.data)
    yield data
    client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{data['id']}", headers=auth_headers)


def _image_post(client, headers, point_id, file_bytes, filename="photo.jpg"):
    return client.post(
        f"{POINT_ENDPOINT}/{point_id}/images",
        headers=headers,
        data={"file": (io.BytesIO(file_bytes), filename)},
        content_type="multipart/form-data",
    )


def _doc_post(client, headers, doc_id, file_bytes, filename="doc.pdf"):
    return client.post(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc_id}/attachment",
        headers=headers,
        data={"file": (io.BytesIO(file_bytes), filename)},
        content_type="multipart/form-data",
    )


# ---------------------------------------------------------------------------
# §1 — Point image upload
# ---------------------------------------------------------------------------

def test_image_upload_too_small(client, auth_headers, point):
    """File below MIN_SIZE (512 B) is rejected before touching MinIO."""
    r = _image_post(client, auth_headers, point["id"], b"\xff\xd8\xff" + b"X" * 10)
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_image_upload_too_large(client, auth_headers, point):
    """File above MAX_IMAGE_SIZE (5 MB) is rejected before touching MinIO."""
    r = _image_post(client, auth_headers, point["id"], _OVERSIZE_IMAGE)
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_image_upload_php_spoofing(client, auth_headers, point):
    """
    PHP bytes submitted with filename photo.jpg must be rejected.
    python-magic inspects the raw bytes and detects text/x-php, which is not
    in ALLOWED_IMAGE_MIMES. The Content-Type multipart field is ignored.
    """
    r = _image_post(client, auth_headers, point["id"], _PHP_BYTES, "photo.jpg")
    assert r.status_code == 400, f"PHP bytes accepted as image → {r.status_code}"


def test_image_upload_html_spoofing(client, auth_headers, point):
    """HTML bytes (potential XSS payload) must be rejected as a non-image MIME."""
    r = _image_post(client, auth_headers, point["id"], _HTML_BYTES, "photo.jpg")
    assert r.status_code == 400, f"HTML bytes accepted as image → {r.status_code}"


def test_image_upload_double_extension_php_bytes(client, auth_headers, point):
    """
    Double-extension file (shell.php.jpg) with PHP bytes must be rejected.
    The extension is irrelevant — MIME detection is by magic bytes.
    """
    r = _image_post(client, auth_headers, point["id"], _PHP_BYTES, "shell.php.jpg")
    assert r.status_code == 400, f"PHP bytes (.php.jpg) accepted → {r.status_code}"


def test_image_upload_no_file_field(client, auth_headers, point):
    """Multipart request without a 'file' field must return 400."""
    r = client.post(
        f"{POINT_ENDPOINT}/{point['id']}/images",
        headers=auth_headers,
        data={"other": "field"},
        content_type="multipart/form-data",
    )
    assert r.status_code == 400, f"missing file field → {r.status_code}"


def test_image_upload_empty_filename(client, auth_headers, point):
    """File field present but filename is empty string must return 400."""
    r = client.post(
        f"{POINT_ENDPOINT}/{point['id']}/images",
        headers=auth_headers,
        data={"file": (io.BytesIO(_JPEG_BYTES), "")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 400, f"empty filename accepted → {r.status_code}"


def test_image_filename_not_used_as_object_key(client, auth_headers, point):
    """
    ImageService generates a UUID7 object key — the client-supplied filename
    is stored only as metadata. Path traversal in the filename has no effect
    on where the object is stored.
    """
    captured = {}

    def fake_upload(file_bytes, object_key, kind):
        captured["key"] = object_key
        return "http://minio/fake-url"

    with patch("Services.image_service.StorageService.upload", side_effect=fake_upload), \
         patch("Services.image_service.StorageService.delete"):
        r = _image_post(client, auth_headers, point["id"], _JPEG_BYTES, "../../etc/passwd")

    assert r.status_code == 201, f"upload failed unexpectedly: {r.data}"
    key = captured.get("key", "")
    assert ".." not in key, f"object key contains path traversal: {key!r}"


# ---------------------------------------------------------------------------
# §2 — Travel-document attachment upload
# ---------------------------------------------------------------------------

def test_doc_upload_too_small(client, auth_headers, travel_doc):
    """File below MIN_SIZE (512 B) rejected before touching MinIO."""
    r = _doc_post(client, auth_headers, travel_doc["id"], b"%PDF-1.4 tiny")
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_doc_upload_too_large(client, auth_headers, travel_doc):
    """File above MAX_DOCUMENT_SIZE (10 MB) rejected before touching MinIO."""
    r = _doc_post(client, auth_headers, travel_doc["id"], _OVERSIZE_DOCUMENT)
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


def test_doc_upload_php_spoofing(client, auth_headers, travel_doc):
    """
    PHP bytes submitted with filename booking.pdf must be rejected.
    python-magic detects text/x-php, not in ALLOWED_DOCUMENT_MIMES.
    """
    r = _doc_post(client, auth_headers, travel_doc["id"], _PHP_BYTES, "booking.pdf")
    assert r.status_code == 400, f"PHP bytes accepted as document → {r.status_code}"


def test_doc_upload_image_bytes_rejected(client, auth_headers, travel_doc):
    """
    JPEG bytes submitted as a document must be rejected.
    image/jpeg is not in ALLOWED_DOCUMENT_MIMES (pdf, msword, docx).
    """
    r = _doc_post(client, auth_headers, travel_doc["id"], _JPEG_BYTES, "photo.pdf")
    assert r.status_code == 400, f"JPEG bytes accepted as document → {r.status_code}"


def test_doc_upload_no_file_field(client, auth_headers, travel_doc):
    """Multipart request without 'file' field must return 400."""
    r = client.post(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{travel_doc['id']}/attachment",
        headers=auth_headers,
        data={"other": "field"},
        content_type="multipart/form-data",
    )
    assert r.status_code == 400, f"missing file field → {r.status_code}"


def test_doc_upload_path_traversal_filename_sanitized(client, auth_headers, travel_doc):
    """
    A filename containing path traversal sequences (../../etc/passwd) must not
    result in an object key with '..' components. TravelDocumentService embeds
    the filename directly in the object key, so the key must be sanitised
    before it reaches StorageService.upload.
    """
    captured = {}

    def fake_upload(file_bytes, object_key, kind):
        captured["key"] = object_key
        return "http://minio/fake-url"

    with patch("Services.travel_document_service.StorageService.upload", side_effect=fake_upload), \
         patch("Services.travel_document_service.StorageService.delete"):
        r = _doc_post(client, auth_headers, travel_doc["id"], _PDF_BYTES, "../../etc/passwd")

    assert r.status_code == 200, f"upload failed unexpectedly: {r.data}"
    key = captured.get("key", "")
    assert ".." not in key, (
        f"object key contains path traversal components: {key!r}\n"
        "Fix: sanitize filename in TravelDocumentService.upload_attachment "
        "using werkzeug.utils.secure_filename before building the object key."
    )
