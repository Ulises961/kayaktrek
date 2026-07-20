"""M7b §3 — paddler search (buddy finder) + invite-by-search/buddy integration.

Search returns public, block-filtered, relationship-annotated rows. The trip-invite
path accepts only a userId (M12 §N removed the email/username lookup branches — a
leader-facing enumeration oracle) plus a block guard.
"""
import pytest

from Api.database import db
from Models.block import Block
from Models.connection import Connection
from Resources.block_resource import BLOCK_ENDPOINT
from Resources.connection_resource import CONNECTION_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT

SEARCH = f"{USER_ENDPOINT}/search/paddlers"


@pytest.fixture(autouse=True)
def _clean():
    yield
    db.session.query(Block).delete()
    db.session.query(Connection).delete()
    db.session.commit()


@pytest.fixture
def both_public(user_1, user_2):
    user_1.profile_is_public = True
    user_2.profile_is_public = True
    db.session.commit()
    yield
    user_1.profile_is_public = False
    user_2.profile_is_public = False
    db.session.commit()


def _make_trip(client, headers):
    resp = client.post(
        f"{TRIP_ENDPOINT}/create", headers=headers,
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
    )
    assert resp.status_code == 201
    return resp.json["id"]


# ── search results & filtering ───────────────────────────────────────────────

def test_search_finds_public_paddler(client, auth_headers, user_2, both_public):
    resp = client.get(f"{SEARCH}?q=charles", headers=auth_headers)
    assert resp.status_code == 200
    usernames = [item["username"] for item in resp.json["items"]]
    assert user_2.username in usernames
    found = next(i for i in resp.json["items"] if i["username"] == user_2.username)
    assert found["relationship"] == "none"
    assert found["connectionId"] is None
    # Private fields never leak into search results.
    assert "mail" not in found and "phone" not in found


def test_search_excludes_private(client, auth_headers, user_2):
    """user_2 private (no both_public) — absent from results."""
    resp = client.get(f"{SEARCH}?q=charles", headers=auth_headers)
    assert resp.status_code == 200
    assert all(i["username"] != user_2.username for i in resp.json["items"])


def test_search_excludes_self(client, auth_headers, user_1, both_public):
    resp = client.get(f"{SEARCH}?q={user_1.username}", headers=auth_headers)
    assert all(i["username"] != user_1.username for i in resp.json["items"])


def test_search_excludes_blocked_either_way(client, auth_headers, id_2, user_2, both_public):
    assert client.post(BLOCK_ENDPOINT, headers=auth_headers, json={"blockedId": id_2}).status_code == 201
    resp = client.get(f"{SEARCH}?q=charles", headers=auth_headers)
    assert all(i["username"] != user_2.username for i in resp.json["items"])


def test_search_empty_query_returns_empty(client, auth_headers, both_public):
    resp = client.get(f"{SEARCH}?q=", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json["items"] == []


def test_search_pagination_envelope(client, auth_headers, both_public):
    resp = client.get(f"{SEARCH}?q=charles&page=1&per_page=10", headers=auth_headers)
    assert resp.status_code == 200
    assert set(resp.json.keys()) >= {"items", "total", "page", "pages"}


def test_search_requires_auth(client):
    assert client.get(f"{SEARCH}?q=charles").status_code in (401, 403)


# ── relationship annotation ──────────────────────────────────────────────────

def test_search_annotates_pending_outgoing(client, auth_headers, user_2, both_public):
    client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers,
                json={"addresseeUsername": user_2.username})
    found = _find(client.get(f"{SEARCH}?q=charles", headers=auth_headers).json, user_2.username)
    assert found["relationship"] == "pending_outgoing"
    assert found["connectionId"] is not None


def test_search_annotates_pending_incoming(
    client, auth_headers, auth_headers_2, user_1, user_2, both_public
):
    client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers_2,
                json={"addresseeUsername": user_1.username})
    found = _find(client.get(f"{SEARCH}?q=charles", headers=auth_headers).json, user_2.username)
    assert found["relationship"] == "pending_incoming"


def test_search_annotates_buddy(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    created = client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers,
                          json={"addresseeUsername": user_2.username}).json
    client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2)
    found = _find(client.get(f"{SEARCH}?q=charles", headers=auth_headers).json, user_2.username)
    assert found["relationship"] == "buddy"


def _find(payload, username):
    return next(i for i in payload["items"] if i["username"] == username)


# ── invite integration ───────────────────────────────────────────────────────

def test_invite_by_user_id(client, auth_headers, id_2):
    trip_id = _make_trip(client, auth_headers)
    try:
        resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers,
                           json={"userId": id_2})
        assert resp.status_code == 201
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_email_and_username_bodies_no_longer_accepted(client, auth_headers, user_2):
    """M12 §N: the email/username invite-lookup branches were removed entirely — a
    stale client sending either key now falls through to the generic missing-userId
    400, the same response as an empty body."""
    trip_id = _make_trip(client, auth_headers)
    try:
        resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers,
                           json={"email": user_2.mail})
        assert resp.status_code == 400
        resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers,
                           json={"username": user_2.username})
        assert resp.status_code == 400
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_invite_blocked_returns_403(client, auth_headers, id_2, user_2):
    trip_id = _make_trip(client, auth_headers)
    try:
        assert client.post(BLOCK_ENDPOINT, headers=auth_headers, json={"blockedId": id_2}).status_code == 201
        resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers,
                           json={"userId": id_2})
        assert resp.status_code == 403
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_invite_missing_identifier_returns_400(client, auth_headers):
    trip_id = _make_trip(client, auth_headers)
    try:
        resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers, json={})
        assert resp.status_code == 400
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
