"""The inbox badge's poll: how many trip invitations, buddy requests and endorsement asks are
waiting on the caller, and how many answers to the caller's own requests they have not seen yet,
as counts, without serialising any of them.

The counts must agree with what the list endpoints return for the same caller, since the badge
is a promise about what the lists will show.
"""
import json
from datetime import date, timedelta

import pytest

from Api.database import db
from Models.block import Block
from Models.connection import Connection
from Models.endorsement_request import EndorsementRequest
from Models.invitation import Invitation
from Models.log import Log
from Models.notification import Notification, NotificationKind
from Resources.connection_resource import CONNECTION_ENDPOINT
from Resources.endorsement_request_resource import ENDORSEMENT_REQUEST_ENDPOINT
from Resources.log_resource import LOG_ENDPOINT
from Resources.pending_requests_resource import PENDING_REQUESTS_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT

SUMMARY = f"{PENDING_REQUESTS_ENDPOINT}/summary"


@pytest.fixture(autouse=True)
def _clean(user_1, user_2):
    """Social-graph and log rows persist in the session schema; clear after each test."""
    yield
    db.session.query(Notification).delete()
    db.session.query(EndorsementRequest).delete()
    db.session.query(Block).delete()
    db.session.query(Connection).delete()
    db.session.query(Log).filter(Log.user_id.in_([user_1.id, user_2.id])).delete(
        synchronize_session=False
    )
    db.session.commit()


@pytest.fixture
def both_public(user_1, user_2):
    """Both users must be publicly visible to be a connection target; restored afterwards."""
    user_1.profile_is_public = True
    user_2.profile_is_public = True
    db.session.commit()
    yield
    user_1.profile_is_public = False
    user_2.profile_is_public = False
    db.session.commit()


def _summary(client, headers):
    response = client.get(SUMMARY, headers=headers)
    assert response.status_code == 200
    return json.loads(response.data)


def test_summary_is_all_zero_when_nothing_is_waiting(client, auth_headers):
    assert _summary(client, auth_headers) == {
        "tripInvitations": 0,
        "buddyRequests": 0,
        "endorsementRequests": 0,
        "acceptedTripInvitations": 0,
        "acceptedBuddyRequests": 0,
    }


def test_summary_requires_authentication(client):
    assert client.get(SUMMARY).status_code == 401


def test_summary_counts_a_trip_invitation_for_the_invitee_only(
    client, trip_with_invitation, auth_headers_2
):
    invitee = _summary(client, auth_headers_2)
    inviter = _summary(client, trip_with_invitation["leader_headers"])

    assert invitee["tripInvitations"] == 1
    assert inviter["tripInvitations"] == 0


def test_summary_ignores_an_expired_trip_invitation(client, trip_with_invitation, auth_headers_2):
    invitation = db.session.query(Invitation).one()
    invitation.expires_at = date.today() - timedelta(days=1)
    db.session.commit()

    assert _summary(client, auth_headers_2)["tripInvitations"] == 0


def test_summary_trip_invitations_match_the_invitation_list(
    client, trip_with_invitation, auth_headers_2, id_2
):
    listed = client.get(f"{TRIP_ENDPOINT}/{id_2}/invitations", headers=auth_headers_2)

    assert _summary(client, auth_headers_2)["tripInvitations"] == len(json.loads(listed.data))


def test_summary_counts_an_incoming_buddy_request_not_an_outgoing_one(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    sent = client.post(
        f"{CONNECTION_ENDPOINT}/request",
        headers=auth_headers,
        json={"addresseeUsername": user_2.username},
    )
    assert sent.status_code == 201

    assert _summary(client, auth_headers_2)["buddyRequests"] == 1
    assert _summary(client, auth_headers)["buddyRequests"] == 0


def test_summary_stops_counting_a_buddy_request_once_accepted(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    sent = client.post(
        f"{CONNECTION_ENDPOINT}/request",
        headers=auth_headers,
        json={"addresseeUsername": user_2.username},
    )
    accepted = client.post(
        f"{CONNECTION_ENDPOINT}/{sent.json['id']}/accept", headers=auth_headers_2
    )
    assert accepted.status_code == 200

    assert _summary(client, auth_headers_2)["buddyRequests"] == 0


def test_summary_counts_an_incoming_endorsement_request(
    client, trip_with_user2_as_crew, id_2
):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    log = client.post(
        f"{LOG_ENDPOINT}/create",
        headers=leader,
        json={"hours": 4, "avgSea": 2, "tripId": trip_with_user2_as_crew["trip"]["id"]},
    )
    asked = client.post(
        ENDORSEMENT_REQUEST_ENDPOINT,
        headers=leader,
        json={"logId": log.json["id"], "addresseeId": id_2},
    )
    assert asked.status_code == 201

    assert _summary(client, crew)["endorsementRequests"] == 1
    assert _summary(client, leader)["endorsementRequests"] == 0


# ── answers to the caller's own requests ─────────────────────────────────────
#
# Accepting a trip invitation or a buddy request leaves a notification for the person who sent
# it, counted in the same summary so the same bell and the same poll carry it.

NOTIFICATIONS_READ = f"{PENDING_REQUESTS_ENDPOINT}/notifications/read"


def _send_buddy_request(client, headers, addressee):
    response = client.post(
        f"{CONNECTION_ENDPOINT}/request",
        headers=headers,
        json={"addresseeUsername": addressee.username},
    )
    assert response.status_code == 201
    return response.json["id"]


def _answer_invitation(client, trip_id, headers, accepted):
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation", headers=headers, json={"accepted": accepted}
    )
    assert response.status_code == 200


def test_accepting_a_trip_invitation_notifies_the_leader_and_nobody_else(
    client, trip_with_invitation, auth_headers_2
):
    leader = trip_with_invitation["leader_headers"]
    _answer_invitation(client, trip_with_invitation["trip"]["id"], auth_headers_2, accepted=True)

    assert _summary(client, leader)["acceptedTripInvitations"] == 1
    assert _summary(client, auth_headers_2)["acceptedTripInvitations"] == 0


def test_the_notification_records_who_accepted_and_which_trip(
    client, trip_with_invitation, auth_headers_2, user_2
):
    trip_id = trip_with_invitation["trip"]["id"]
    _answer_invitation(client, trip_id, auth_headers_2, accepted=True)

    notification = db.session.query(Notification).one()
    assert notification.kind is NotificationKind.TRIP_INVITATION_ACCEPTED
    assert notification.actor_id == user_2.id
    assert str(notification.trip_id) == trip_id
    assert notification.read_at is None


def test_declining_a_trip_invitation_notifies_nobody(client, trip_with_invitation, auth_headers_2):
    _answer_invitation(client, trip_with_invitation["trip"]["id"], auth_headers_2, accepted=False)

    assert db.session.query(Notification).count() == 0
    assert _summary(client, trip_with_invitation["leader_headers"])["acceptedTripInvitations"] == 0


def test_accepting_a_buddy_request_notifies_the_requester_and_not_the_accepter(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    request_id = _send_buddy_request(client, auth_headers, user_2)
    assert _summary(client, auth_headers)["acceptedBuddyRequests"] == 0

    accepted = client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)
    assert accepted.status_code == 200

    assert _summary(client, auth_headers)["acceptedBuddyRequests"] == 1
    assert _summary(client, auth_headers_2)["acceptedBuddyRequests"] == 0


def test_accepting_a_buddy_request_twice_notifies_once(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    """Accepting is idempotent; the requester must not be told twice."""
    request_id = _send_buddy_request(client, auth_headers, user_2)

    client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)
    client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)

    assert db.session.query(Notification).count() == 1


def test_a_notification_is_gone_with_the_trip_it_is_about(
    client, trip_with_invitation, auth_headers_2
):
    trip_id = trip_with_invitation["trip"]["id"]
    _answer_invitation(client, trip_id, auth_headers_2, accepted=True)
    assert db.session.query(Notification).count() == 1

    deleted = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"])
    assert deleted.status_code == 200

    assert db.session.query(Notification).count() == 0


def test_marking_one_kind_read_clears_its_count_and_leaves_the_other(
    client, trip_with_invitation, auth_headers, auth_headers_2, user_2, both_public
):
    request_id = _send_buddy_request(client, auth_headers, user_2)
    client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)
    _answer_invitation(client, trip_with_invitation["trip"]["id"], auth_headers_2, accepted=True)
    assert _summary(client, auth_headers)["acceptedBuddyRequests"] == 1
    assert _summary(client, auth_headers)["acceptedTripInvitations"] == 1

    marked = client.post(
        NOTIFICATIONS_READ,
        headers=auth_headers,
        json={"kind": NotificationKind.BUDDY_REQUEST_ACCEPTED.value},
    )

    assert marked.status_code == 200
    assert _summary(client, auth_headers)["acceptedBuddyRequests"] == 0
    assert _summary(client, auth_headers)["acceptedTripInvitations"] == 1


def test_marking_read_keeps_the_notification_but_stamps_it(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    request_id = _send_buddy_request(client, auth_headers, user_2)
    client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)

    client.post(
        NOTIFICATIONS_READ,
        headers=auth_headers,
        json={"kind": NotificationKind.BUDDY_REQUEST_ACCEPTED.value},
    )

    notification = db.session.query(Notification).one()
    assert notification.read_at is not None


def test_marking_read_never_touches_another_users_notifications(
    client, auth_headers, auth_headers_2, user_2, both_public
):
    request_id = _send_buddy_request(client, auth_headers, user_2)
    client.post(f"{CONNECTION_ENDPOINT}/{request_id}/accept", headers=auth_headers_2)

    client.post(
        NOTIFICATIONS_READ,
        headers=auth_headers_2,
        json={"kind": NotificationKind.BUDDY_REQUEST_ACCEPTED.value},
    )

    assert _summary(client, auth_headers)["acceptedBuddyRequests"] == 1


def test_marking_read_rejects_an_unknown_kind(client, auth_headers):
    response = client.post(NOTIFICATIONS_READ, headers=auth_headers, json={"kind": "nonsense"})

    assert response.status_code == 400


def test_marking_read_requires_authentication(client):
    response = client.post(NOTIFICATIONS_READ, json={"kind": "buddy_request_accepted"})

    assert response.status_code == 401


def test_summary_is_scoped_to_the_caller(client, trip_with_invitation, auth_headers):
    """A third party sees nothing of an invitation addressed to someone else."""
    assert _summary(client, auth_headers)["tripInvitations"] == 0
