"""M7b §2 — blocking and block precedence.

Covers block CRUD plus the cross-cutting rule that a block beats everything:
it tears down connections + pending invitations on create, hides the public
profile, and forbids endorsement of a shared-trip log.
"""
import pytest

from Api.database import db
from Models.block import Block
from Models.connection import Connection
from Models.invitation import Invitation
from Resources.block_resource import BLOCK_ENDPOINT
from Resources.connection_resource import CONNECTION_ENDPOINT
from Resources.log_resource import LOG_ENDPOINT
from Resources.user_resource import USER_ENDPOINT


@pytest.fixture(autouse=True)
def _clean_social_graph():
    """Blocks and connections persist in the session schema; clear after each test."""
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


def _block(client, headers, **body):
    return client.post(BLOCK_ENDPOINT, headers=headers, json=body)


# ── create ───────────────────────────────────────────────────────────────────

def test_block_success_by_username(client, auth_headers, user_2):
    """A private target can still be blocked — blocking is not visibility-gated."""
    resp = _block(client, auth_headers, blockedUsername=user_2.username)
    assert resp.status_code == 201
    assert resp.json["blocked"]["username"] == user_2.username


def test_block_success_by_id(client, auth_headers, id_2):
    resp = _block(client, auth_headers, blockedId=id_2)
    assert resp.status_code == 201


def test_block_self_returns_403(client, auth_headers, user_1):
    resp = _block(client, auth_headers, blockedUsername=user_1.username)
    assert resp.status_code == 403


def test_block_missing_field_returns_400(client, auth_headers):
    resp = client.post(BLOCK_ENDPOINT, headers=auth_headers, json={})
    assert resp.status_code == 400


def test_block_unknown_returns_404(client, auth_headers):
    resp = _block(client, auth_headers, blockedUsername="no_such_paddler_xyz")
    assert resp.status_code == 404


def test_block_duplicate_returns_409(client, auth_headers, id_2):
    assert _block(client, auth_headers, blockedId=id_2).status_code == 201
    assert _block(client, auth_headers, blockedId=id_2).status_code == 409


# ── hard-reset teardown on create ────────────────────────────────────────────

def test_block_tears_down_connection(client, auth_headers, user_2, id_2, both_public):
    created = client.post(
        f"{CONNECTION_ENDPOINT}/request", headers=auth_headers,
        json={"addresseeUsername": user_2.username},
    )
    assert created.status_code == 201
    assert db.session.query(Connection).count() == 1

    assert _block(client, auth_headers, blockedId=id_2).status_code == 201
    assert db.session.query(Connection).count() == 0


def test_block_revokes_pending_invitation(client, auth_headers, id_2, trip_with_invitation):
    """user_1 leads a trip with a pending invite to user_2; blocking user_2 revokes it."""
    assert db.session.query(Invitation).count() == 1
    assert _block(client, auth_headers, blockedId=id_2).status_code == 201
    assert db.session.query(Invitation).count() == 0


# ── remove (unblock) ─────────────────────────────────────────────────────────

def test_unblock_removes(client, auth_headers, id_2):
    created = _block(client, auth_headers, blockedId=id_2).json
    resp = client.delete(f"{BLOCK_ENDPOINT}/{created['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert db.session.query(Block).count() == 0


def test_unblock_does_not_restore_connection(
    client, auth_headers, user_2, id_2, both_public
):
    client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers,
                json={"addresseeUsername": user_2.username})
    created = _block(client, auth_headers, blockedId=id_2).json
    client.delete(f"{BLOCK_ENDPOINT}/{created['id']}", headers=auth_headers)
    # Connection stays gone — users must re-request.
    assert db.session.query(Connection).count() == 0


def test_unblock_by_non_blocker_returns_403(client, auth_headers, auth_headers_2, id_2):
    created = _block(client, auth_headers, blockedId=id_2).json
    resp = client.delete(f"{BLOCK_ENDPOINT}/{created['id']}", headers=auth_headers_2)
    assert resp.status_code == 403


def test_unblock_unknown_returns_404(client, auth_headers):
    fake = "00000000-0000-7000-8000-0000000000cc"
    resp = client.delete(f"{BLOCK_ENDPOINT}/{fake}", headers=auth_headers)
    assert resp.status_code == 404


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_blocks(client, auth_headers, id_2):
    _block(client, auth_headers, blockedId=id_2)
    resp = client.get(BLOCK_ENDPOINT, headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json) == 1
    assert resp.json[0]["blocked"]["id"] == id_2


def test_list_blocks_requires_auth(client):
    assert client.get(BLOCK_ENDPOINT).status_code in (401, 403)


# ── precedence: block beats everything ───────────────────────────────────────

def test_block_hides_public_profile(
    client, auth_headers, auth_headers_2, user_1, user_2, both_public
):
    """A blocked viewer gets the same neutral 404 as for a private/missing profile."""
    # Anonymous & unblocked viewers can see user_1's public profile.
    assert client.get(f"{USER_ENDPOINT}/{user_1.username}/public").status_code == 200

    # user_1 blocks user_2; user_2 can no longer see user_1's profile.
    assert _block(client, auth_headers, blockedUsername=user_2.username).status_code == 201
    blocked_view = client.get(
        f"{USER_ENDPOINT}/{user_1.username}/public", headers=auth_headers_2
    )
    assert blocked_view.status_code == 404


def test_block_forbids_shared_trip_endorsement(
    client, auth_headers, auth_headers_2, id_2, trip_with_user2_as_crew
):
    """Even on the exact shared trip, a block forbids the endorsement (403)."""
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    crew_headers = trip_with_user2_as_crew["crew_headers"]
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    created = client.post(f"{LOG_ENDPOINT}/create", headers=leader_headers,
                          json={"hours": 4, "avgSea": 2, "tripId": trip_id})
    log_id = created.json["id"]

    # Leader blocks the crew member, then the crew member tries to endorse.
    assert _block(client, leader_headers, blockedId=id_2).status_code == 201
    endorse = client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=crew_headers)
    assert endorse.status_code == 403


def test_block_prevents_connection_request(client, auth_headers, user_2, id_2, both_public):
    """A blocked target is unreachable for a buddy request — neutral 404."""
    assert _block(client, auth_headers, blockedId=id_2).status_code == 201
    resp = client.post(f"{CONNECTION_ENDPOINT}/request", headers=auth_headers,
                       json={"addresseeUsername": user_2.username})
    assert resp.status_code == 404


# ── model-level guard ────────────────────────────────────────────────────────

def test_db_rejects_self_block(app, user_1):
    from sqlalchemy.exc import IntegrityError

    db.session.add(Block(blocker_id=user_1.id, blocked_id=user_1.id))
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()
