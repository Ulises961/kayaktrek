"""M36 — trip-changes poll: tickets, authorisation, membership cache, answers."""
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

import Resources.live_resource as live_resource
from Api.database import db
from Resources.live_resource import LIVE_ENDPOINT
from Services import live_stream_service
from Services.live_stream_service import MEMBERSHIP_CACHE_SECONDS, LiveStreamService
from Services.trip_change_service import TripChange, TripChangeService


@pytest.fixture(autouse=True)
def _forget_confirmed_members():
    live_stream_service._confirmed_members.clear()
    yield
    live_stream_service._confirmed_members.clear()


def _changes_url(trip_id, *, since=None, ticket=None):
    query = [f"since={since}"] if since is not None else []
    if ticket is not None:
        query.append(f"ticket={ticket}")
    return f"{LIVE_ENDPOINT}/trip/{trip_id}/changes" + ("?" + "&".join(query) if query else "")


def _ticket_for(app, trip_id, user_id):
    with app.app_context():
        return LiveStreamService.mint_changes_ticket(trip_id, user_id)


def test_changes_ticket_round_trips_with_its_user(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(ticket, trip_id) == "user-123"


def test_changes_ticket_for_another_trip_is_rejected(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(ticket, str(uuid4())) is None


def test_position_ticket_does_not_open_the_changes_poll_and_vice_versa(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        position_ticket = LiveStreamService.mint_stream_ticket(trip_id)
        changes_ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(position_ticket, trip_id) is None
        assert LiveStreamService.verify_stream_ticket(changes_ticket, trip_id) is False


def test_post_changes_ticket_requires_auth(client, trip_with_user2_as_crew):
    response = client.post(f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes-ticket")
    assert response.status_code in (401, 403)


def test_post_changes_ticket_non_member_is_forbidden(client, outsider_headers, trip_with_user2_as_crew):
    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes-ticket", headers=outsider_headers
    )
    assert response.status_code == 403


def test_post_changes_ticket_returns_a_ticket_naming_the_caller(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_id}/changes-ticket", headers=trip_with_user2_as_crew["crew_headers"]
    )
    assert response.status_code == 200
    with app.app_context():
        assert LiveStreamService.verify_changes_ticket(response.json["ticket"], trip_id) == trip_with_user2_as_crew[
            "crew_id"
        ]


def test_poll_without_credentials_is_404(client, trip_with_user2_as_crew):
    response = client.get(_changes_url(trip_with_user2_as_crew["trip"]["id"]))
    assert response.status_code == 404


def test_poll_with_a_bad_ticket_is_404(client, trip_with_user2_as_crew):
    response = client.get(_changes_url(trip_with_user2_as_crew["trip"]["id"], ticket="not-a-ticket"))
    assert response.status_code == 404


def test_poll_rejects_a_position_stream_ticket(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        position_ticket = LiveStreamService.mint_stream_ticket(trip_id)
    assert client.get(_changes_url(trip_id, ticket=position_ticket)).status_code == 404


def test_poll_with_the_ticket_of_a_non_member_is_404(app, client, trip_with_user2_as_crew):
    """A ticket is minted for a member, but membership is re-checked on every poll: a member
    removed within the ticket's 5 minutes must not keep getting answers."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    ticket = _ticket_for(app, trip_id, str(uuid4()))
    assert client.get(_changes_url(trip_id, ticket=ticket)).status_code == 404


def test_poll_by_a_non_member_with_a_valid_header_is_404(client, outsider_headers, trip_with_user2_as_crew):
    response = client.get(_changes_url(trip_with_user2_as_crew["trip"]["id"]), headers=outsider_headers)
    assert response.status_code == 404


def test_poll_of_a_malformed_trip_id_is_404_not_an_error(app, client):
    ticket = _ticket_for(app, "not-a-uuid", str(uuid4()))
    assert client.get(_changes_url("not-a-uuid", ticket=ticket)).status_code == 404


def test_a_crew_member_with_a_ticket_is_told_what_changed_since(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    baseline = TripChangeService.current_revision(trip_id)
    change = TripChange("point", uuid4(), "update")
    TripChangeService.publish(UUID(trip_id), [TripChange("day", uuid4(), "create")])
    TripChangeService.publish(UUID(trip_id), [change])
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    response = client.get(_changes_url(trip_id, since=baseline + 1, ticket=ticket))

    assert response.status_code == 200
    assert response.json == {"rev": baseline + 2, "changes": [change.to_wire()], "truncated": False}


def test_the_leader_can_poll_with_an_access_token(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    baseline = TripChangeService.current_revision(trip_id)
    TripChangeService.publish(UUID(trip_id), [TripChange("trip", UUID(trip_id), "update")])

    response = client.get(_changes_url(trip_id, since=baseline), headers=trip_with_user2_as_crew["leader_headers"])

    assert response.status_code == 200
    assert response.json["rev"] == baseline + 1
    assert response.json["changes"] == [{"t": "trip", "id": trip_id, "op": "update"}]


def test_a_poll_with_no_cursor_only_reports_where_things_stand(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    baseline = TripChangeService.current_revision(trip_id)
    TripChangeService.publish(UUID(trip_id), [TripChange("point", uuid4(), "update")])
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    response = client.get(_changes_url(trip_id, ticket=ticket))

    assert response.json == {"rev": baseline + 1, "changes": [], "truncated": False}


def test_a_cursor_ahead_of_the_log_is_told_to_refresh_everything(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    baseline = TripChangeService.current_revision(trip_id)
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    response = client.get(_changes_url(trip_id, since=baseline + 99, ticket=ticket))

    assert response.json == {"rev": baseline, "changes": [], "truncated": True}


def test_an_unparseable_cursor_is_treated_as_no_cursor(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    response = client.get(f"{_changes_url(trip_id, ticket=ticket)}&since=abc")

    assert response.status_code == 200
    assert response.json["changes"] == []
    assert response.json["truncated"] is False


def test_the_answer_is_never_cached(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    response = client.get(_changes_url(trip_id, since=TripChangeService.current_revision(trip_id), ticket=ticket))

    assert response.headers["Cache-Control"] == "no-store"


def test_an_unreachable_log_is_a_503_with_a_retry_after_not_a_claim_that_everything_changed(
    app, client, trip_with_user2_as_crew
):
    class _Unreachable:
        def get(self, key):
            raise ConnectionError("redis unreachable")

    trip_id = trip_with_user2_as_crew["trip"]["id"]
    ticket = _ticket_for(app, trip_id, trip_with_user2_as_crew["crew_id"])

    with patch("Services.trip_change_service.live_redis", return_value=_Unreachable()):
        response = client.get(_changes_url(trip_id, since=1, ticket=ticket))

    assert response.status_code == 503
    assert int(response.headers["Retry-After"]) > 0


def test_the_rate_limit_is_keyed_on_the_user_so_a_shared_address_is_not_one_budget(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    leader_ticket = _ticket_for(app, trip_id, "leader-id")
    crew_ticket = _ticket_for(app, trip_id, "crew-id")

    keys = []
    for ticket in (leader_ticket, crew_ticket):
        with app.test_request_context(_changes_url(trip_id, ticket=ticket), environ_base={"REMOTE_ADDR": "10.0.0.1"}):
            keys.append(live_resource._changes_rate_key())

    assert keys == ["user:leader-id", "user:crew-id"]


def test_without_valid_credentials_the_rate_limit_falls_back_to_the_address(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    with app.test_request_context(_changes_url(trip_id, ticket="junk"), environ_base={"REMOTE_ADDR": "10.0.0.7"}):
        assert live_resource._changes_rate_key() == "ip:10.0.0.7"


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def membership_queries(monkeypatch):
    """Counts the database checks behind `is_trip_member_cached`, answering from a settable set."""

    class _Queries:
        def __init__(self):
            self.calls = 0
            self.members: set[tuple[str, str]] = set()

    queries = _Queries()

    def fake_is_member(trip_id, user_id):
        queries.calls += 1
        return (trip_id, user_id) in queries.members

    monkeypatch.setattr(LiveStreamService, "_is_trip_member", staticmethod(fake_is_member))
    return queries


def test_a_confirmed_member_is_not_looked_up_again_within_the_window(membership_queries):
    clock = _Clock()
    membership_queries.members.add(("trip", "user"))

    results = [LiveStreamService.is_trip_member_cached("trip", "user", monotonic=clock) for _ in range(3)]

    assert results == [True, True, True]
    assert membership_queries.calls == 1


def test_membership_is_looked_up_again_once_the_window_has_passed(membership_queries):
    clock = _Clock()
    membership_queries.members.add(("trip", "user"))
    LiveStreamService.is_trip_member_cached("trip", "user", monotonic=clock)

    clock.now += MEMBERSHIP_CACHE_SECONDS + 1
    membership_queries.members.clear()

    assert LiveStreamService.is_trip_member_cached("trip", "user", monotonic=clock) is False
    assert membership_queries.calls == 2


def test_a_refusal_is_not_remembered_so_a_new_member_is_let_in_at_once(membership_queries):
    clock = _Clock()
    assert LiveStreamService.is_trip_member_cached("trip", "user", monotonic=clock) is False

    membership_queries.members.add(("trip", "user"))

    assert LiveStreamService.is_trip_member_cached("trip", "user", monotonic=clock) is True


def test_the_membership_cache_is_per_user_and_per_trip(membership_queries):
    clock = _Clock()
    membership_queries.members.add(("trip-a", "user"))
    LiveStreamService.is_trip_member_cached("trip-a", "user", monotonic=clock)

    assert LiveStreamService.is_trip_member_cached("trip-b", "user", monotonic=clock) is False
    assert LiveStreamService.is_trip_member_cached("trip-a", "someone-else", monotonic=clock) is False


def test_the_membership_cache_cannot_grow_without_bound(membership_queries, monkeypatch):
    monkeypatch.setattr(live_stream_service, "_MEMBERSHIP_CACHE_MAX_ENTRIES", 3)
    clock = _Clock()
    for index in range(10):
        membership_queries.members.add(("trip", f"user-{index}"))
        LiveStreamService.is_trip_member_cached("trip", f"user-{index}", monotonic=clock)

    assert len(live_stream_service._confirmed_members) <= 3


def test_a_malformed_id_is_not_a_member_rather_than_an_error(app):
    with app.app_context():
        assert LiveStreamService._is_trip_member("not-a-uuid", str(uuid4())) is False


def test_the_membership_check_leaves_the_callers_session_in_place(app):
    """The poll is one short request, and its app context releases the session when it ends.
    Releasing it here too detaches everything else held in that session; the suite's
    session-scoped users are among those, so later tests on the same worker fail, at random."""
    session_before = db.session()

    LiveStreamService._is_trip_member(str(uuid4()), str(uuid4()))

    assert db.session() is session_before
