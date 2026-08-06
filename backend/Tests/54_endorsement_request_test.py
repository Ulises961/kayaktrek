"""M7b §2b — endorsement requests (author-initiated asks to endorse a trip log).

Covers eligibility parity with the endorse rule (author-only, trip-linked, addressee
is a member, not self, no block), the inbox/outbox listing, cancel/decline, and the
key integration: endorsing resolves the matching pending request to `actioned`.
"""
import pytest

from Api.database import db
from Models.block import Block
from Models.connection import Connection
from Models.endorsement_request import (
    EndorsementRequest,
    EndorsementRequestStatusType,
)
from Models.log import Log
from Models.user import User
from Resources.block_resource import BLOCK_ENDPOINT
from Resources.endorsement_request_resource import ENDORSEMENT_REQUEST_ENDPOINT as ER
from Resources.log_resource import LOG_ENDPOINT


@pytest.fixture(autouse=True)
def _clean(user_1, user_2):
    """Social-graph + log rows persist in the session schema; clear after each test."""
    yield
    db.session.query(EndorsementRequest).delete()
    db.session.query(Block).delete()
    db.session.query(Connection).delete()
    db.session.query(Log).filter(Log.user_id.in_([user_1.id, user_2.id])).delete(
        synchronize_session=False
    )
    db.session.commit()


def _create_trip_log(client, headers, trip_id):
    resp = client.post(
        f"{LOG_ENDPOINT}/create", headers=headers,
        json={"hours": 4, "avgSea": 2, "tripId": trip_id},
    )
    assert resp.status_code == 201
    return resp.json["id"]


def _request(client, headers, **body):
    return client.post(ER, headers=headers, json=body)


# ── create ───────────────────────────────────────────────────────────────────

def test_create_request_success(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    resp = _request(client, leader, logId=log_id, addresseeId=id_2)
    assert resp.status_code == 201
    assert resp.json["status"] == "pending"
    assert resp.json["addressee"]["id"] == id_2
    assert resp.json["log"]["id"] == log_id


def test_create_by_non_author_returns_403(client, trip_with_user2_as_crew, id):
    """The crew member cannot request endorsements on the leader's log."""
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    resp = _request(client, crew, logId=log_id, addresseeId=id)
    assert resp.status_code == 403
    # Verify no endorsement request was created
    assert db.session.query(EndorsementRequest).count() == 0


def test_create_for_standalone_log_returns_422(client, auth_headers, id_2):
    """A log with no trip cannot be endorsed, so it cannot be requested either."""
    created = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                          json={"hours": 2, "avgSea": 1}).json
    resp = _request(client, auth_headers, logId=created["id"], addresseeId=id_2)
    assert resp.status_code == 422


def test_create_for_non_member_returns_403(
    client, trip_with_user2_as_crew, outsider_headers
):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    resp = _request(client, leader, logId=log_id, addresseeUsername="outsider_tmp")
    assert resp.status_code == 403
    # Verify no endorsement request was created
    assert db.session.query(EndorsementRequest).count() == 0


def test_create_self_returns_403(client, trip_with_user2_as_crew, id):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    resp = _request(client, leader, logId=log_id, addresseeId=id)
    assert resp.status_code == 403
    # Verify no endorsement request was created
    assert db.session.query(EndorsementRequest).count() == 0


def test_create_blocked_returns_403(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    assert client.post(BLOCK_ENDPOINT, headers=leader, json={"blockedId": id_2}).status_code == 201
    resp = _request(client, leader, logId=log_id, addresseeId=id_2)
    assert resp.status_code == 403
    # Verify no endorsement request was created
    assert db.session.query(EndorsementRequest).count() == 0


def test_create_duplicate_returns_409(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    assert _request(client, leader, logId=log_id, addresseeId=id_2).status_code == 201
    assert _request(client, leader, logId=log_id, addresseeId=id_2).status_code == 409


def test_create_already_endorsed_returns_409(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    assert client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=crew).status_code == 200
    resp = _request(client, leader, logId=log_id, addresseeId=id_2)
    assert resp.status_code == 409


def test_create_missing_log_id_returns_400(client, auth_headers, id_2):
    assert _request(client, auth_headers, addresseeId=id_2).status_code == 400


def test_create_missing_addressee_returns_400(client, trip_with_user2_as_crew):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    assert _request(client, leader, logId=log_id).status_code == 400


def test_create_unknown_log_returns_404(client, auth_headers, id_2):
    fake = "00000000-0000-7000-8000-0000000000ee"
    assert _request(client, auth_headers, logId=fake, addresseeId=id_2).status_code == 404


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_incoming_and_outgoing(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    _request(client, leader, logId=log_id, addresseeId=id_2)

    incoming = client.get(f"{ER}?direction=incoming", headers=crew).json
    outgoing = client.get(f"{ER}?direction=outgoing", headers=leader).json
    assert len(incoming) == 1
    assert len(outgoing) == 1
    # The addressee's inbox should NOT show it as outgoing.
    assert client.get(f"{ER}?direction=outgoing", headers=crew).json == []


def test_list_invalid_direction_returns_400(client, auth_headers):
    assert client.get(f"{ER}?direction=sideways", headers=auth_headers).status_code == 400


# ── delete (cancel / decline) ────────────────────────────────────────────────

def test_author_cancels_request(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    created = _request(client, leader, logId=log_id, addresseeId=id_2).json
    assert client.delete(f"{ER}/{created['id']}", headers=leader).status_code == 200
    assert db.session.query(EndorsementRequest).count() == 0


def test_addressee_declines_request(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    created = _request(client, leader, logId=log_id, addresseeId=id_2).json
    assert client.delete(f"{ER}/{created['id']}", headers=crew).status_code == 200
    assert db.session.query(EndorsementRequest).count() == 0


def test_delete_by_outsider_returns_403(
    client, trip_with_user2_as_crew, id_2, outsider_headers
):
    leader = trip_with_user2_as_crew["leader_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    created = _request(client, leader, logId=log_id, addresseeId=id_2).json
    assert client.delete(f"{ER}/{created['id']}", headers=outsider_headers).status_code == 403
    # Verify the endorsement request still exists
    assert db.session.query(EndorsementRequest).count() == 1


def test_delete_unknown_returns_404(client, auth_headers):
    fake = "00000000-0000-7000-8000-0000000000ff"
    assert client.delete(f"{ER}/{fake}", headers=auth_headers).status_code == 404


# ── integration: endorsing resolves the request ──────────────────────────────

def test_endorse_resolves_pending_request(client, trip_with_user2_as_crew, id_2):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
    _request(client, leader, logId=log_id, addresseeId=id_2)

    # The crew member fulfils the ask through the existing endorse endpoint.
    assert client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=crew).status_code == 200

    row = db.session.query(EndorsementRequest).one()
    assert row.status is EndorsementRequestStatusType.ACTIONED
    assert row.responded_at is not None
    # Resolved requests leave the pending inbox.
    assert client.get(f"{ER}?direction=incoming", headers=crew).json == []


# ── GDPR cascade ─────────────────────────────────────────────────────────────

def test_deleting_user_cascades_request(app):
    """The FK cascade the GDPR erasure relies on tears down requests for a deleted user.

    Uses throwaway users/log at the model level so no session-scoped fixture is removed.
    """
    author = User(mail="er.author@example.com", pwd="x", phone="+390000000010",
                  name="ER Author", username="er_author", active=True)
    addressee = User(mail="er.addressee@example.com", pwd="x", phone="+390000000011",
                     name="ER Addressee", username="er_addressee", active=True)
    db.session.add_all([author, addressee])
    db.session.flush()

    log = Log(user_id=author.id, hours=1)
    db.session.add(log)
    db.session.flush()

    db.session.add(EndorsementRequest(
        log_id=log.id, requester_id=author.id, addressee_id=addressee.id,
        status=EndorsementRequestStatusType.PENDING,
    ))
    db.session.commit()

    db.session.delete(addressee)
    db.session.commit()
    assert db.session.query(EndorsementRequest).filter_by(log_id=log.id).count() == 0

    # Clean up the throwaway rows.
    db.session.delete(log)
    db.session.delete(author)
    db.session.commit()
