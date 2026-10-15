"""
Trip leadership succession.

A trip can end up with zero LEADER TripMember rows (the leader left, or their
account was erased) while remaining fully visible to crew. Covers: leader
nomination of a successor, first-come-first-serve claiming when nobody was
nominated, nominee-exclusive claiming when someone was, blocking claims while
a leader still exists or the trip is ARCHIVED, and the trip-wide invalidation
of leader-shared medical notes on a successful claim.
"""
import json
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Models.user import User
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT
from Services.Middleware.auth_middleware import JWTService
from Services.crypto_service import encrypt, encrypt_for_recipient
from Tests.auth_helpers import access_token_for


def _elevated_headers(client, headers, password):
    r = client.post(f"{USER_ENDPOINT}/me/re-auth", json={"password": password}, headers=headers)
    assert r.status_code == 200
    token = json.loads(r.data)["elevatedToken"]
    return {**headers, "X-Elevated-Token": token}


def _register_and_activate(app, client, mail, username, phone):
    password = "CrewPass9$"
    client.post("/api/v1/auth/register", json={
        "mail": mail, "pwd": password, "phone": phone, "name": "Test Crew", "username": username,
    })
    with app.app_context():
        user = _db.session.query(User).filter_by(mail=mail).first()
        user.active = True
        _db.session.commit()
        token = access_token_for(user)
        user_id = str(user.id)
    return user_id, {"Authorization": f"Bearer {token}"}, password


@pytest.fixture
def trip_with_two_crew(app, client, auth_headers):
    """Trip led by user_1, with two additional crew members via invite/accept."""
    r = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert r.status_code == 201
    trip_id = json.loads(r.data)["id"]

    crew_a_id, crew_a_headers, _ = _register_and_activate(
        app, client, "leadership.crew.a@example.com", "leadership_crew_a", "+39099911101"
    )
    crew_b_id, crew_b_headers, _ = _register_and_activate(
        app, client, "leadership.crew.b@example.com", "leadership_crew_b", "+39099911102"
    )

    for user_id, headers in ((crew_a_id, crew_a_headers), (crew_b_id, crew_b_headers)):
        inv = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", json={"userId": user_id}, headers=auth_headers)
        assert inv.status_code == 201
        accept = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invitation", json={"accepted": True}, headers=headers)
        assert accept.status_code == 200

    yield {
        "trip_id": trip_id,
        "leader_headers": auth_headers,
        "crew_a_id": crew_a_id,
        "crew_a_headers": crew_a_headers,
        "crew_b_id": crew_b_id,
        "crew_b_headers": crew_b_headers,
    }

    with app.app_context():
        trip = _db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if trip:
            _db.session.delete(trip)
            _db.session.commit()
    for user_id in (crew_a_id, crew_b_id):
        with app.app_context():
            user = _db.session.query(User).filter_by(id=UUID(user_id)).first()
            if user:
                _db.session.delete(user)
                _db.session.commit()


# =============================================================================
# Nominate / clear successor
# =============================================================================

def test_nominate_successor_sets_flag(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    r = client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_a_id']}/nominate-successor",
        headers=t["leader_headers"],
    )
    assert r.status_code == 200

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["nominatedSuccessor"] is True
    assert by_id[t["crew_b_id"]]["nominatedSuccessor"] is False


def test_nominate_successor_replaces_previous_nominee(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_a_id']}/nominate-successor",
        headers=t["leader_headers"],
    )
    client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_b_id']}/nominate-successor",
        headers=t["leader_headers"],
    )

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["nominatedSuccessor"] is False
    assert by_id[t["crew_b_id"]]["nominatedSuccessor"] is True


def test_nominate_successor_non_leader_forbidden(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    r = client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_b_id']}/nominate-successor",
        headers=t["crew_a_headers"],
    )
    assert r.status_code == 403

    # The denial must be a true no-op — nobody got nominated.
    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    assert all(not m["nominatedSuccessor"] for m in trip["travellers"])


def test_nominate_successor_target_not_member_404(app, client, trip_with_two_crew, outsider_headers):
    t = trip_with_two_crew
    r = client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/00000000-0000-7000-8000-000000000000/nominate-successor",
        headers=t["leader_headers"],
    )
    assert r.status_code == 404


def test_nominate_successor_cannot_target_leader(app, client, trip_with_two_crew, id):
    t = trip_with_two_crew
    r = client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{id}/nominate-successor",
        headers=t["leader_headers"],
    )
    assert r.status_code == 400


def test_clear_nomination_leader_only(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_a_id']}/nominate-successor",
        headers=t["leader_headers"],
    )

    forbidden = client.delete(f"{TRIP_ENDPOINT}/{t['trip_id']}/nominate-successor", headers=t["crew_a_headers"])
    assert forbidden.status_code == 403

    # The denial must be a true no-op — crew_a is still nominated.
    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["nominatedSuccessor"] is True

    ok = client.delete(f"{TRIP_ENDPOINT}/{t['trip_id']}/nominate-successor", headers=t["leader_headers"])
    assert ok.status_code == 200

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    assert all(not m["nominatedSuccessor"] for m in trip["travellers"])


def test_clear_nomination_noop_when_none(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    r = client.delete(f"{TRIP_ENDPOINT}/{t['trip_id']}/nominate-successor", headers=t["leader_headers"])
    assert r.status_code == 200


# =============================================================================
# Claim leadership
# =============================================================================

def test_claim_leadership_blocked_when_leader_present(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    r = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_a_headers"])
    assert r.status_code == 409

    # The rejected claim must be a true no-op — crew_a is still crew, leader still leader.
    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["role"] == "crew"
    assert any(m["role"] == "leader" for m in trip["travellers"])


def test_claim_leadership_non_member_forbidden(app, client, trip_with_two_crew, outsider_headers):
    t = trip_with_two_crew
    r = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=outsider_headers)
    assert r.status_code == 403

    # The outsider must not have been added as a member of the trip.
    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)
    member_user_ids = {m["user"]["id"] for m in trip["travellers"]}
    assert len(member_user_ids) == 3  # leader + crew_a + crew_b, unchanged


def test_claim_leadership_first_come_first_serve_when_not_nominated(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    leave = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/leave", headers=t["leader_headers"])
    assert leave.status_code == 200

    claim = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_b_headers"])
    assert claim.status_code == 200

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_b_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_b_id"]]["role"] == "leader"


def test_claim_leadership_nominee_exclusive_when_nominated(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/{t['crew_a_id']}/nominate-successor",
        headers=t["leader_headers"],
    )
    client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/leave", headers=t["leader_headers"])

    rejected = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_b_headers"])
    assert rejected.status_code == 403

    # The rejected claim must be a true no-op — crew_b is still crew, the trip is
    # still leaderless (nobody but the nominee may claim).
    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_a_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_b_id"]]["role"] == "crew"
    assert not any(m["role"] == "leader" for m in trip["travellers"])

    accepted = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_a_headers"])
    assert accepted.status_code == 200

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_a_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["role"] == "leader"
    assert by_id[t["crew_a_id"]]["nominatedSuccessor"] is False


def test_claim_leadership_blocked_on_archived_trip(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    with app.app_context():
        leader_membership = _db.session.query(TripMember).filter_by(
            trip_id=UUID(t["trip_id"]), role=MemberRoleType.LEADER
        ).first()
        _db.session.delete(leader_membership)
        trip = _db.session.query(Trip).filter_by(id=UUID(t["trip_id"])).first()
        trip.state = TripStateType.ARCHIVED
        _db.session.commit()

    r = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_a_headers"])
    assert r.status_code == 409

    # The rejected claim must be a true no-op — the trip stays leaderless and archived.
    with app.app_context():
        _db.session.expire_all()
        remaining_leader = _db.session.query(TripMember).filter_by(
            trip_id=UUID(t["trip_id"]), role=MemberRoleType.LEADER
        ).first()
        assert remaining_leader is None
        trip = _db.session.query(Trip).filter_by(id=UUID(t["trip_id"])).first()
        assert trip.state == TripStateType.ARCHIVED


def test_claim_leadership_clears_shared_medical_notes_trip_wide(app, client, trip_with_two_crew):
    t = trip_with_two_crew

    # Crew A shares trip-level medical notes with the current (soon-to-leave) leader.
    elevated = _elevated_headers(client, t["crew_a_headers"], "CrewPass9$")
    ciphertext, nonce, salt = encrypt("Allergic to bee stings.", "CrewPass9$")
    client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/me/medical-consent",
        json={"ciphertext": ciphertext, "nonce": nonce, "salt": salt},
        headers=elevated,
    )
    leader_key = json.loads(client.get(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/me/leader-public-key",
        headers=t["crew_a_headers"],
    ).data)["publicKey"]
    ct, leader_nonce, ephemeral = encrypt_for_recipient("Allergic to bee stings.", leader_key)
    elevated = _elevated_headers(client, t["crew_a_headers"], "CrewPass9$")
    share = client.post(
        f"{TRIP_ENDPOINT}/{t['trip_id']}/member/me/share-medical-notes",
        json={"ciphertext": ct, "nonce": leader_nonce, "ephemeralKey": ephemeral},
        headers=elevated,
    )
    assert share.status_code == 200
    assert json.loads(share.data)["hasLeaderMedicalNotes"] is True

    client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/leave", headers=t["leader_headers"])
    claim = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/claim-leadership", headers=t["crew_b_headers"])
    assert claim.status_code == 200

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_b_headers"]).data)
    by_id = {m["user"]["id"]: m for m in trip["travellers"]}
    assert by_id[t["crew_a_id"]]["hasLeaderMedicalNotes"] is False
    assert by_id[t["crew_a_id"]]["medicalNotesConsentAt"] is None
    # The member's own encrypted-at-rest copy is untouched by the leadership change.
    assert by_id[t["crew_a_id"]]["hasTripMedicalNotes"] is True


def test_leave_trip_makes_trip_leaderless_but_still_visible_to_crew(app, client, trip_with_two_crew):
    t = trip_with_two_crew
    leave = client.post(f"{TRIP_ENDPOINT}/{t['trip_id']}/leave", headers=t["leader_headers"])
    assert leave.status_code == 200

    r = client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_a_headers"])
    assert r.status_code == 200
    trip = json.loads(r.data)
    assert all(m["role"] != "leader" for m in trip["travellers"])


# =============================================================================
# Who may see when a member shared their medical notes
# =============================================================================

def _share_notes_with_leader(client, trip_id, member_headers):
    """The member stores sealed notes and then seals a copy to the leader — the flow that
    stamps their consent time."""
    elevated = _elevated_headers(client, member_headers, "CrewPass9$")
    ciphertext, nonce, salt = encrypt("Allergic to bee stings.", "CrewPass9$")
    stored = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"ciphertext": ciphertext, "nonce": nonce, "salt": salt},
        headers=elevated,
    )
    assert stored.status_code == 200
    leader_key = json.loads(client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/leader-public-key", headers=member_headers,
    ).data)["publicKey"]
    sealed, leader_nonce, ephemeral = encrypt_for_recipient("Allergic to bee stings.", leader_key)
    elevated = _elevated_headers(client, member_headers, "CrewPass9$")
    shared = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"ciphertext": sealed, "nonce": leader_nonce, "ephemeralKey": ephemeral},
        headers=elevated,
    )
    assert shared.status_code == 200


@pytest.fixture
def crew_who_both_shared_notes(client, trip_with_two_crew):
    t = trip_with_two_crew
    for headers in (t["crew_a_headers"], t["crew_b_headers"]):
        _share_notes_with_leader(client, t["trip_id"], headers)
    return t


def _consent_times(travellers):
    return {m["user"]["id"]: m["medicalNotesConsentAt"] for m in travellers}


def test_the_leader_sees_when_every_member_shared(client, crew_who_both_shared_notes):
    t = crew_who_both_shared_notes

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["leader_headers"]).data)

    times = _consent_times(trip["travellers"])
    assert times[t["crew_a_id"]] is not None
    assert times[t["crew_b_id"]] is not None


def test_a_crew_member_sees_their_own_consent_time_but_not_a_crewmates(client, crew_who_both_shared_notes):
    t = crew_who_both_shared_notes

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_b_headers"]).data)

    times = _consent_times(trip["travellers"])
    assert times[t["crew_b_id"]] is not None
    assert times[t["crew_a_id"]] is None


def test_every_trip_listing_hides_a_crewmates_consent_time_too(client, crew_who_both_shared_notes):
    """The rule belongs to the serialiser, not to one endpoint: the paginated list a crew member
    opens their trips from carries the same travellers."""
    t = crew_who_both_shared_notes

    page = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['crew_b_id']}/all", headers=t["crew_b_headers"]).data)

    trip = next(item for item in page["items"] if item["id"] == t["trip_id"])
    times = _consent_times(trip["travellers"])
    assert times[t["crew_b_id"]] is not None
    assert times[t["crew_a_id"]] is None


def test_a_crew_members_view_of_the_trip_carries_no_phantom_notes_field(client, crew_who_both_shared_notes):
    t = crew_who_both_shared_notes

    trip = json.loads(client.get(f"{TRIP_ENDPOINT}/{t['trip_id']}", headers=t["crew_b_headers"]).data)

    assert all("medicalNotes" not in member for member in trip["travellers"])
