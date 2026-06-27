"""M7b §1 — buddy connections (request / accept / decline / unfriend / list).

Covers the same-pair guards (self, mirror duplicate), addressee-only accept,
either-party removal, outsider rejection, and the privacy rule that a non-public
target is a neutral 404.
"""
import pytest

from Api.database import db
from Models.connection import Connection, ConnectionStatusType
from Resources.connection_resource import CONNECTION_ENDPOINT


@pytest.fixture(autouse=True)
def _clean_connections():
    """Connections persist in the session-scoped schema; clear after each test."""
    yield
    db.session.query(Connection).delete()
    db.session.commit()


@pytest.fixture
def both_public(user_1, user_2):
    """Make both fixture users publicly visible (required to be a connection target),
    then restore so other test files on the same worker see the default private state.
    """
    user_1.profile_is_public = True
    user_2.profile_is_public = True
    db.session.commit()
    yield
    user_1.profile_is_public = False
    user_2.profile_is_public = False
    db.session.commit()


def _request(client, headers, **body):
    return client.post(f"{CONNECTION_ENDPOINT}/request", headers=headers, json=body)


# ── request ──────────────────────────────────────────────────────────────────

def test_request_connection_success(client, auth_headers, user_2, both_public):
    resp = _request(client, auth_headers, addresseeUsername=user_2.username)
    assert resp.status_code == 201
    assert resp.json["status"] == "pending"
    assert resp.json["addressee"]["username"] == user_2.username


def test_request_by_id_success(client, auth_headers, id_2, both_public):
    resp = _request(client, auth_headers, addresseeId=id_2)
    assert resp.status_code == 201
    assert resp.json["status"] == "pending"


def test_request_self_returns_403(client, auth_headers, user_1, both_public):
    resp = _request(client, auth_headers, addresseeUsername=user_1.username)
    assert resp.status_code == 403


def test_request_missing_field_returns_400(client, auth_headers):
    resp = client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers, json={})
    assert resp.status_code == 400


def test_request_private_target_returns_404(client, auth_headers, user_2):
    """user_2 is private (no both_public) — neutral 404, no existence oracle."""
    resp = _request(client, auth_headers, addresseeUsername=user_2.username)
    assert resp.status_code == 404


def test_request_unknown_target_returns_404(client, auth_headers):
    resp = _request(client, auth_headers, addresseeUsername="no_such_paddler_xyz")
    assert resp.status_code == 404


def test_request_duplicate_returns_409(client, auth_headers, user_2, both_public):
    assert _request(client, auth_headers, addresseeUsername=user_2.username).status_code == 201
    dup = _request(client, auth_headers, addresseeUsername=user_2.username)
    assert dup.status_code == 409


def test_request_mirror_duplicate_returns_409(
    client, auth_headers, auth_headers_2, user_1, user_2, both_public
):
    """A request the other way round when one already exists is rejected."""
    assert _request(client, auth_headers, addresseeUsername=user_2.username).status_code == 201
    mirror = _request(client, auth_headers_2, addresseeUsername=user_1.username)
    assert mirror.status_code == 409


# ── accept ───────────────────────────────────────────────────────────────────

def test_accept_connection(client, auth_headers, auth_headers_2, user_2, both_public):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    resp = client.post(
        f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2
    )
    assert resp.status_code == 200
    assert resp.json["status"] == "accepted"
    assert resp.json["respondedAt"] is not None


def test_accept_is_idempotent(client, auth_headers, auth_headers_2, user_2, both_public):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    first = client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2)
    second = client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2)
    assert first.status_code == second.status_code == 200
    assert second.json["status"] == "accepted"


def test_accept_by_non_addressee_returns_403(client, auth_headers, user_2, both_public):
    """The requester cannot accept their own outgoing request."""
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    resp = client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers)
    assert resp.status_code == 403


def test_accept_unknown_returns_404(client, auth_headers_2):
    fake = "00000000-0000-7000-8000-0000000000aa"
    resp = client.post(f"{CONNECTION_ENDPOINT}/{fake}/accept", headers=auth_headers_2)
    assert resp.status_code == 404


# ── remove (decline / unfriend) ──────────────────────────────────────────────

def test_decline_pending_removes(client, auth_headers, auth_headers_2, user_2, both_public):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    resp = client.delete(f"{CONNECTION_ENDPOINT}/{created['id']}", headers=auth_headers_2)
    assert resp.status_code == 200
    assert db.session.query(Connection).count() == 0


def test_unfriend_accepted_removes(client, auth_headers, auth_headers_2, user_2, both_public):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2)
    # Either party can unfriend — here the original requester does.
    resp = client.delete(f"{CONNECTION_ENDPOINT}/{created['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert db.session.query(Connection).count() == 0


def test_remove_by_outsider_returns_403(
    client, auth_headers, user_2, both_public, outsider_headers
):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json
    resp = client.delete(f"{CONNECTION_ENDPOINT}/{created['id']}", headers=outsider_headers)
    assert resp.status_code == 403


def test_remove_unknown_returns_404(client, auth_headers):
    fake = "00000000-0000-7000-8000-0000000000bb"
    resp = client.delete(f"{CONNECTION_ENDPOINT}/{fake}", headers=auth_headers)
    assert resp.status_code == 404


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_includes_both_directions_and_filters_by_status(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    created = _request(client, auth_headers, addresseeUsername=user_2.username).json

    # Pending shows for both the requester and the addressee.
    requester_view = client.get(CONNECTION_ENDPOINT, headers=auth_headers).json
    addressee_view = client.get(CONNECTION_ENDPOINT, headers=auth_headers_2).json
    assert len(requester_view) == 1
    assert len(addressee_view) == 1

    # Filter to accepted before acceptance → empty.
    assert client.get(f"{CONNECTION_ENDPOINT}?status=accepted", headers=auth_headers).json == []

    client.post(f"{CONNECTION_ENDPOINT}/{created['id']}/accept", headers=auth_headers_2)
    accepted = client.get(f"{CONNECTION_ENDPOINT}?status=accepted", headers=auth_headers).json
    assert len(accepted) == 1
    assert accepted[0]["status"] == "accepted"


def test_list_invalid_status_returns_400(client, auth_headers):
    resp = client.get(f"{CONNECTION_ENDPOINT}?status=bogus", headers=auth_headers)
    assert resp.status_code == 400


def test_list_requires_auth(client):
    resp = client.get(CONNECTION_ENDPOINT)
    assert resp.status_code in (401, 403)


# ── model-level guards ───────────────────────────────────────────────────────

def test_db_rejects_self_connection(app, user_1):
    """The CHECK constraint backs the service self-guard at the DB level."""
    from sqlalchemy.exc import IntegrityError

    db.session.add(
        Connection(
            requester_id=user_1.id,
            addressee_id=user_1.id,
            status=ConnectionStatusType.PENDING,
        )
    )
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()
