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
