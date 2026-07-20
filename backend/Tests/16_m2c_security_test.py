"""
M2c security regression tests.

Covers every item in the M2c Definition of Done:
- Cross-user access on user endpoints (§1)
- Cross-user access on trip mutations and collection endpoints (§1)
- Public itinerary read-only enforcement (§2)
- Missing token → 401, invalid token → 401 (§3)
- GET /api/itinerary/all returns 200 (§4)
- DELETE trip is leader-only and always deletes for everyone; crew self-removal is a
  separate POST /leave endpoint (§5)
- Login: any failure → 401 with same message (§7)
- Register response contains no tokens (§8)
"""
import json
import random
import pytest

from Api.database import db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT


# ---------------------------------------------------------------------------
# §1 — Cross-user access on user endpoints
# ---------------------------------------------------------------------------

def test_get_other_user_forbidden(client, auth_headers, id_2):
    """Authenticated user cannot GET another user's profile."""
    r = client.get(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers)
    assert r.status_code == 403


def test_patch_other_user_forbidden(client, auth_headers, id_2):
    """Authenticated user cannot PATCH another user's profile."""
    r = client.patch(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers, json={"name": "hacked"})
    assert r.status_code == 403


def test_delete_other_user_forbidden(client, auth_headers, id_2):
    """Authenticated user cannot DELETE another user's account."""
    r = client.delete(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers)
    assert r.status_code == 403


def test_get_own_user_allowed(client, auth_headers, id):
    """User can GET their own profile."""
    r = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# §1 — Cross-user access on trip collection endpoints
# ---------------------------------------------------------------------------

def test_get_other_user_trips_forbidden(client, auth_headers, id_2):
    """User cannot list another user's trips."""
    r = client.get(f"{TRIP_ENDPOINT}/{id_2}/all", headers=auth_headers)
    assert r.status_code == 403


def test_get_other_user_invitations_forbidden(client, auth_headers, id_2):
    """User cannot list another user's trip invitations."""
    r = client.get(f"{TRIP_ENDPOINT}/{id_2}/invitations", headers=auth_headers)
    assert r.status_code == 403


def test_patch_trip_non_member_forbidden(client, outsider_headers, auth_headers):
    """Non-member cannot PATCH a trip."""
    r = client.post(f"{TRIP_ENDPOINT}/create", headers=auth_headers, json={"inventory": {}})
    assert r.status_code == 201
    trip_id = json.loads(r.data)["id"]

    patch = client.patch(f"{TRIP_ENDPOINT}/{trip_id}", headers=outsider_headers, json={"destination": "Stolen"})
    assert patch.status_code == 403

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_delete_trip_non_member_forbidden(client, outsider_headers, auth_headers):
    """Non-member cannot DELETE a trip."""
    r = client.post(f"{TRIP_ENDPOINT}/create", headers=auth_headers, json={"inventory": {}})
    assert r.status_code == 201
    trip_id = json.loads(r.data)["id"]

    delete = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=outsider_headers)
    assert delete.status_code == 403

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


# ---------------------------------------------------------------------------
# §2 — Public itinerary is read-only
# ---------------------------------------------------------------------------

def _create_public_itinerary(client, auth_headers):
    r = client.post(
        f"{TRIP_ENDPOINT}/create",
        headers=auth_headers,
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
    )
    assert r.status_code == 201
    trip = json.loads(r.data)
    return trip["id"], trip["itinerary"]["id"]


def test_non_member_can_read_public_itinerary(client, outsider_headers, auth_headers):
    """Any authenticated user can GET a public itinerary."""
    trip_id, itinerary_id = _create_public_itinerary(client, auth_headers)

    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=outsider_headers)
    assert r.status_code == 200

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_non_member_cannot_patch_public_itinerary(client, outsider_headers, auth_headers):
    """Non-member cannot PATCH a public itinerary even though it is readable."""
    trip_id, itinerary_id = _create_public_itinerary(client, auth_headers)

    r = client.patch(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=outsider_headers, json={"totalMiles": 99})
    assert r.status_code == 403

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_owner_cannot_patch_public_itinerary(client, auth_headers):
    """Even the owner cannot PATCH a public (frozen) itinerary — must clone first."""
    trip_id, itinerary_id = _create_public_itinerary(client, auth_headers)

    r = client.patch(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=auth_headers, json={"totalMiles": 99})
    assert r.status_code == 409

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


# ---------------------------------------------------------------------------
# §3 — Auth middleware: missing/invalid token → 401
# ---------------------------------------------------------------------------

def test_missing_token_returns_401(client):
    """Request with no Authorization header must return 401."""
    r = client.get(f"{USER_ENDPOINT}/some-id")
    assert r.status_code == 401


def test_invalid_token_returns_401(client):
    """Request with a malformed token must return 401."""
    r = client.get(f"{USER_ENDPOINT}/some-id", headers={"Authorization": "Bearer not.a.token"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# §4 — GET /api/itinerary/all is no longer broken
# ---------------------------------------------------------------------------

def test_get_all_itineraries_returns_200(client, auth_headers):
    r = client.get(f"{ITINERARY_ENDPOINT}/all", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(json.loads(r.data), list)


# ---------------------------------------------------------------------------
# §5 — DELETE is leader-only full deletion; crew cannot invoke it at all
# ---------------------------------------------------------------------------

def test_crew_cannot_delete_trip(client, trip_with_invitation):
    """A crew member must not be able to delete the trip for everyone."""
    trip_id = trip_with_invitation["trip"]["id"]
    crew_headers = trip_with_invitation["invitee_headers"]

    accept = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        headers=crew_headers,
        json={"accepted": True},
    )
    assert accept.status_code == 200

    delete = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=crew_headers)
    assert delete.status_code == 403


def test_leader_delete_removes_trip_for_everyone(client, auth_headers):
    r = client.post(f"{TRIP_ENDPOINT}/create", headers=auth_headers, json={"inventory": {}})
    assert r.status_code == 201
    trip_id = json.loads(r.data)["id"]

    delete = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert delete.status_code == 200
    assert client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers).status_code == 404


# ---------------------------------------------------------------------------
# §7 — Login always returns 401 for any failure
# ---------------------------------------------------------------------------

def test_login_wrong_email_returns_401(client):
    r = client.post("/api/v1/auth/login", json={"mail": "ghost@nowhere.com", "pwd": "Pass123!"})
    assert r.status_code == 401
    assert json.loads(r.data)["message"] == "Invalid credentials"


def test_login_wrong_password_returns_401(client, app):
    unique = "logincheck001"
    client.post("/api/v1/auth/register", json={
        "mail": f"{unique}@example.com", "pwd": "RealPass9$",
        "phone": "+39090909090", "name": "Check", "username": unique,
    })
    user = User.query.filter_by(mail=f"{unique}@example.com").first()
    user.active = True
    db.session.commit()

    r = client.post("/api/v1/auth/login", json={"mail": f"{unique}@example.com", "pwd": "WrongPass9$"})
    assert r.status_code == 401
    assert json.loads(r.data)["message"] == "Invalid credentials"


def test_login_inactive_account_returns_401(client):
    """Inactive (unverified) account must return the same 401 as wrong credentials."""
    unique = "inactivecheck001"
    client.post("/api/v1/auth/register", json={
        "mail": f"{unique}@example.com", "pwd": "RealPass9$",
        "phone": "+39080808080", "name": "Inactive", "username": unique,
    })
    # Do NOT activate the user
    r = client.post("/api/v1/auth/login", json={"mail": f"{unique}@example.com", "pwd": "RealPass9$"})
    assert r.status_code == 401
    assert json.loads(r.data)["message"] == "Invalid credentials"


def test_login_with_username_instead_of_email(client, app):
    """Login succeeds when username is supplied instead of mail."""
    unique = "usernamelogin001"
    client.post("/api/v1/auth/register", json={
        "mail": f"{unique}@example.com", "pwd": "RealPass9$",
        "phone": "+39070707070", "name": "ByUsername", "username": unique,
    })
    user = User.query.filter_by(username=unique).first()
    user.active = True
    db.session.commit()

    r = client.post("/api/v1/auth/login", json={"username": unique, "pwd": "RealPass9$"})
    assert r.status_code == 200
    assert "access_token" in json.loads(r.data)


# ---------------------------------------------------------------------------
# §8 — Register response contains no tokens
# ---------------------------------------------------------------------------

def test_register_response_has_no_tokens(client):
    data = {
        "mail": f"notokens_{random.randint(1000,9999)}@example.com",
        "pwd": "NoTokens9$",
        "phone": f"+3906060{random.randint(1000,9999)}",
        "name": "NoTokens",
        "username": f"notokens_{random.randint(1000,9999)}",
    }
    r = client.post("/api/v1/auth/register", json=data)
    assert r.status_code == 201
    body = json.loads(r.data)
    assert "access_token" not in body
    assert "refresh_token" not in body
