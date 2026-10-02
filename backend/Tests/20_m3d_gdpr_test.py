"""
GDPR §11 (data export, Art. 15/20) and §12 (account deletion + erasure task, Art. 17)
integration tests.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import UUID

import pytest

from Api.database import db
from Models.auth_token import AuthToken, AuthTokenType
from Models.day import Day
from Models.log import Log
from Models.point import Point
from Models.trip import Trip, TripStateType
from Models.user import User
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.log_resource import LOG_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT
from Services.auth_service import AuthService
from Services.Middleware.auth_middleware import JWTService
from Tests.auth_helpers import access_token_for
from Tasks.data_export import export_user_data
from Tasks.erasure import run_erasure

_GDPR_PWD = "GdprPass9$"


# =============================================================================
# Helpers
# =============================================================================

def _register_and_activate(app, client, *, mail, phone, username, pwd=_GDPR_PWD):
    r = client.post("/api/v1/auth/register", json={
        "mail": mail,
        "pwd": pwd,
        "phone": phone,
        "name": "GDPR",
        "username": username,
    })
    assert r.status_code == 201
    with app.app_context():
        user = User.query.filter_by(mail=mail).first()
        user.active = True
        db.session.commit()
        user_id = str(user.id)
        token = access_token_for(user)
    return user_id, {"Authorization": f"Bearer {token}"}


def _delete_user(app, user_id: str) -> None:
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if user:
            db.session.delete(user)
            db.session.commit()


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture(scope="function")
def export_user(app, client):
    user_id, headers = _register_and_activate(
        app, client,
        mail="export.gdpr@example.com",
        phone="+39099922221",
        username="gdpr_export_user",
    )
    yield {"id": user_id, "headers": headers}
    _delete_user(app, user_id)


@pytest.fixture(scope="function")
def deletion_user(app, client):
    user_id, headers = _register_and_activate(
        app, client,
        mail="deletion.gdpr@example.com",
        phone="+39099922222",
        username="gdpr_deletion_user",
    )
    yield {"id": user_id, "headers": headers}
    _delete_user(app, user_id)


@pytest.fixture(scope="function")
def erasure_user(app, client):
    """User past the 30-day grace period — picked up by the erasure task."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="erasure.gdpr@example.com",
        phone="+39099922223",
        username="gdpr_erasure_user",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()
    yield user_id
    _delete_user(app, user_id)


@pytest.fixture(scope="function")
def recent_deletion_user(app, client):
    """User within the 30-day grace period — must not be erased."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="recent.del.gdpr@example.com",
        phone="+39099922224",
        username="gdpr_recent_del_user",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=1)
        user.active = False
        db.session.commit()
    yield user_id
    _delete_user(app, user_id)


@pytest.fixture(scope="function")
def erasure_leader_with_trip(app, client):
    """User who led a trip and is now past the deletion grace period."""
    user_id, headers = _register_and_activate(
        app, client,
        mail="leader.erasure@example.com",
        phone="+39099922225",
        username="gdpr_leader_erasure",
    )
    r = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
        headers=headers,
    )
    assert r.status_code == 201
    body = json.loads(r.data)
    trip_id = body["id"]

    # Seed the itinerary the way real usage leaves it — a staging Day 0 with an
    # actual route point on it. An empty itinerary is a state the app never
    # produces, and seeding one here is what let a broken erasure cascade pass
    # this suite for months.
    itinerary_id = body["itinerary"]["id"]
    builder = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=headers)
    assert builder.status_code == 200
    day0 = next(d for d in json.loads(builder.data)["days"] if d["dayNumber"] == 0)
    point = client.post(
        f"{POINT_ENDPOINT}/create",
        json={"dayId": day0["id"], "type": "position", "latitude": 43.5, "longitude": -7.0},
        headers=headers,
    )
    assert point.status_code == 201

    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    yield {"user_id": user_id, "trip_id": trip_id}

    with app.app_context():
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if trip:
            db.session.delete(trip)
            db.session.commit()
    _delete_user(app, user_id)


# =============================================================================
# §11 — POST /api/user/me/data-export
# =============================================================================

def test_data_export_requires_auth(client):
    r = client.post(f"{USER_ENDPOINT}/me/data-export")
    assert r.status_code in (401, 403)


def test_data_export_queues_task_and_returns_202(client, export_user):
    with patch("Resources.user_resource.export_user_data.delay") as mock_delay:
        r = client.post(f"{USER_ENDPOINT}/me/data-export", headers=export_user["headers"])
    assert r.status_code == 202
    mock_delay.assert_called_once()


# =============================================================================
# §11 — GET /api/user/me/data-export/<token>
# =============================================================================

def test_export_task_uploads_to_object_storage(app, export_user):
    """Regression (issue #23): the task must upload the export to shared object
    storage, not local disk — the worker and web run in separate containers."""
    with app.app_context(), \
         patch("Tasks.data_export.StorageService.upload_export") as mock_upload, \
         patch("Tasks.data_export.send_template_email") as mock_mail:
        export_user_data.apply(args=[export_user["id"]])

    mock_upload.assert_called_once()
    object_key, data = mock_upload.call_args.args
    assert object_key.endswith(".json")
    assert b"profile" in data
    mock_mail.assert_called_once()


def test_download_export_invalid_token_returns_400(client):
    r = client.get(f"{USER_ENDPOINT}/me/data-export/not-a-real-token-at-all")
    assert r.status_code == 400


def test_download_export_valid_token_streams_file(app, client, export_user):
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(export_user["id"])).first()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DATA_EXPORT)

    blob = json.dumps({"profile": {"id": export_user["id"]}}).encode("utf-8")
    with patch("Resources.user_resource.StorageService.download_export", return_value=blob), \
         patch("Resources.user_resource.StorageService.delete_export"):
        r = client.get(f"{USER_ENDPOINT}/me/data-export/{raw_token}")

    assert r.status_code == 200
    assert "attachment" in r.headers.get("Content-Disposition", "")
    assert r.data == blob


def test_download_export_deletes_object_after_serving(app, client, export_user):
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(export_user["id"])).first()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DATA_EXPORT)

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    with patch("Resources.user_resource.StorageService.download_export", return_value=b"{}"), \
         patch("Resources.user_resource.StorageService.delete_export") as mock_delete:
        client.get(f"{USER_ENDPOINT}/me/data-export/{raw_token}")

    mock_delete.assert_called_once_with(f"{token_hash}.json")


def test_download_export_token_is_single_use(app, client, export_user):
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(export_user["id"])).first()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DATA_EXPORT)

    with patch("Resources.user_resource.StorageService.download_export", return_value=b"{}"), \
         patch("Resources.user_resource.StorageService.delete_export"):
        first = client.get(f"{USER_ENDPOINT}/me/data-export/{raw_token}")
        # Token consumed on the first call → reuse is rejected before storage is touched.
        second = client.get(f"{USER_ENDPOINT}/me/data-export/{raw_token}")

    assert first.status_code == 200
    assert second.status_code == 400


def test_download_export_missing_object_returns_404(app, client, export_user):
    """Token is valid but the object does not exist (task not yet complete)."""
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(export_user["id"])).first()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DATA_EXPORT)

    with patch("Resources.user_resource.StorageService.download_export", return_value=None):
        r = client.get(f"{USER_ENDPOINT}/me/data-export/{raw_token}")
    assert r.status_code == 404


# =============================================================================
# §12 — DELETE /api/user/me (deletion request)
# =============================================================================

def test_request_deletion_requires_auth(client):
    r = client.delete(f"{USER_ENDPOINT}/me")
    assert r.status_code in (401, 403)


def test_request_deletion_returns_202(client, deletion_user):
    r = client.delete(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    assert r.status_code == 202


def test_request_deletion_deactivates_account(app, client, deletion_user):
    client.delete(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(deletion_user["id"])).first()
        assert user.active is False
        assert user.deletion_requested_at is not None


def test_request_deletion_sets_grace_period_timestamp(app, client, deletion_user):
    before = datetime.now(timezone.utc)
    client.delete(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    after = datetime.now(timezone.utc)
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(deletion_user["id"])).first()
        ts = user.deletion_requested_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        assert before <= ts <= after


def test_deleted_account_jwt_rejected(client, deletion_user):
    """Existing JWT must be rejected after the account is deactivated."""
    client.delete(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    r = client.get(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    assert r.status_code == 403


def test_request_deletion_revokes_all_auth_tokens(app, client, deletion_user):
    """DB-persisted auth tokens (refresh tokens) must be wiped on deletion."""
    client.delete(f"{USER_ENDPOINT}/me", headers=deletion_user["headers"])
    with app.app_context():
        count = (
            db.session.query(AuthToken)
            .filter_by(user_id=UUID(deletion_user["id"]))
            .count()
        )
        # Only the DELETION_CANCEL token created by request_deletion should remain
        cancel_count = (
            db.session.query(AuthToken)
            .filter_by(user_id=UUID(deletion_user["id"]), type=AuthTokenType.DELETION_CANCEL)
            .count()
        )
        assert count == cancel_count


# =============================================================================
# §12 — DELETE /api/user/me/deletion-request (cancellation)
# =============================================================================

def test_cancel_deletion_requires_token_param(client):
    r = client.delete(f"{USER_ENDPOINT}/me/deletion-request")
    assert r.status_code == 400


def test_cancel_deletion_rejects_invalid_token(client):
    r = client.delete(f"{USER_ENDPOINT}/me/deletion-request?token=garbage-token-value")
    assert r.status_code == 400


def test_cancel_deletion_reactivates_account(app, client, deletion_user):
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(deletion_user["id"])).first()
        user.deletion_requested_at = datetime.now(timezone.utc)
        user.active = False
        db.session.commit()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DELETION_CANCEL)

    r = client.delete(f"{USER_ENDPOINT}/me/deletion-request?token={raw_token}")
    assert r.status_code == 200

    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(deletion_user["id"])).first()
        assert user.active is True
        assert user.deletion_requested_at is None


def test_cancel_deletion_token_is_single_use(app, client, deletion_user):
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(deletion_user["id"])).first()
        user.deletion_requested_at = datetime.now(timezone.utc)
        user.active = False
        db.session.commit()
        raw_token = AuthService._create_token(user.id, AuthTokenType.DELETION_CANCEL)

    client.delete(f"{USER_ENDPOINT}/me/deletion-request?token={raw_token}")
    r = client.delete(f"{USER_ENDPOINT}/me/deletion-request?token={raw_token}")
    assert r.status_code == 400


# =============================================================================
# §12 — Erasure task (run_erasure)
# =============================================================================

def test_erasure_task_skips_users_within_grace_period(app, recent_deletion_user):
    run_erasure.apply()
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(recent_deletion_user)).first()
        assert user is not None


def test_erasure_task_hard_deletes_user_after_grace_period(app, erasure_user):
    run_erasure.apply()
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(erasure_user)).first()
        assert user is None


def test_erasure_task_skips_active_users_even_with_stale_timestamp(app, client):
    """active=True users must never be erased, even if deletion_requested_at is set."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="active.stale@example.com",
        phone="+39099922226",
        username="gdpr_active_stale",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        # deliberately leave active=True (abnormal state, but the query must not touch it)
        db.session.commit()

    run_erasure.apply()

    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        assert user is not None

    _delete_user(app, user_id)


def test_erasure_task_archives_led_trip(app, erasure_leader_with_trip):
    """Trips led by the erased user must be archived, not deleted."""
    run_erasure.apply()
    with app.app_context():
        trip = db.session.query(Trip).filter_by(
            id=UUID(erasure_leader_with_trip["trip_id"])
        ).first()
        assert trip is not None
        assert trip.state == TripStateType.ARCHIVED


def test_erasure_task_preserves_trip_record(app, erasure_leader_with_trip):
    """The trip row itself must survive erasure — only the user row is deleted."""
    run_erasure.apply()
    with app.app_context():
        trip = db.session.query(Trip).filter_by(
            id=UUID(erasure_leader_with_trip["trip_id"])
        ).first()
        assert trip is not None


def test_erasure_task_preserves_archived_trips_itinerary_and_route(app, erasure_leader_with_trip):
    """Archiving a led trip is meant to preserve it for the remaining crew — but
    Itinerary.user_id carries ON DELETE CASCADE (correct for standalone, non-trip
    itineraries). Left un-nulled on the archive path, that same cascade deletes the
    itinerary the moment the leader's user row goes, taking its Day/Point chain with
    it via the itinerary->day->point cascade — an "archived" trip with no route at
    all. `_erase_user` must null `trip.itinerary.user_id` before deleting the user."""
    run_erasure.apply()
    with app.app_context():
        trip = db.session.query(Trip).filter_by(
            id=UUID(erasure_leader_with_trip["trip_id"])
        ).first()
        assert trip is not None
        itinerary = trip.itinerary
        assert itinerary is not None, "itinerary must survive erasure of its archived trip's leader"
        assert itinerary.user_id is None, "ownership pointer must be nulled, not left dangling"

        days = db.session.query(Day).filter_by(itinerary_id=itinerary.id).all()
        assert len(days) > 0, "the itinerary's Days must survive too"
        points = db.session.query(Point).filter(Point.day_id.in_([d.id for d in days])).all()
        assert len(points) > 0, "the route itself (the Point on Day 0) must survive too"


def test_erasure_task_deletes_personal_logs(app, client):
    """`Log.user_id` carries `ondelete='CASCADE'` at the DB level today, but
    `_erase_user` also deletes logs explicitly before the user row goes (see the
    comment in Tasks/erasure.py) — assert that behaviour directly rather than
    trusting the FK definition, per the cascade being exactly the class of bug
    that broke this task for months."""
    user_id, headers = _register_and_activate(
        app, client,
        mail="logs.erasure@example.com",
        phone="+39099922227",
        username="gdpr_logs_erasure",
    )
    r = client.post(
        f"{LOG_ENDPOINT}/create",
        json={"hours": 3.5, "avgSea": 2, "distance": 12.0, "notes": "Nice paddle"},
        headers=headers,
    )
    assert r.status_code == 201
    log_id = json.loads(r.data)["id"]

    with app.app_context():
        assert db.session.query(Log).filter_by(id=UUID(log_id)).first() is not None
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    run_erasure.apply()

    with app.app_context():
        assert db.session.query(Log).filter_by(id=UUID(log_id)).first() is None

    _delete_user(app, user_id)


def test_erasure_task_removes_avatar_from_storage(app, client):
    """Avatar objects live in object storage, outside the DB — nothing cascades
    them, so `_erase_user` must delete them explicitly using the key embedded in
    `avatar_url`."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="avatar.erasure@example.com",
        phone="+39099922228",
        username="gdpr_avatar_erasure",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.avatar_url = "https://cdn.example.com/avatars/abc123.jpg"
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    with patch("Tasks.erasure.StorageService.delete") as mock_delete:
        run_erasure.apply()

    mock_delete.assert_called_once_with("abc123.jpg", kind="avatar")
    with app.app_context():
        assert db.session.query(User).filter_by(id=UUID(user_id)).first() is None


def test_erasure_task_survives_avatar_cleanup_failure(app, client):
    """Storage being unreachable must not block the user's actual erasure — the
    avatar cleanup failure is caught and logged, not left to abort `_erase_user`
    (and, per the rubric, the transaction must stay usable afterwards)."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="avatar.fail.erasure@example.com",
        phone="+39099922229",
        username="gdpr_avatar_fail_erasure",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.avatar_url = "https://cdn.example.com/avatars/broken.jpg"
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    with patch("Tasks.erasure.StorageService.delete", side_effect=RuntimeError("bucket unreachable")):
        result = run_erasure.apply()

    assert result.get() == {"erased": 1, "failed": 0}
    with app.app_context():
        assert db.session.query(User).filter_by(id=UUID(user_id)).first() is None
        # session must still be usable — no dangling PendingRollbackError
        assert db.session.query(User).count() >= 0


def test_erasure_task_removes_banner_from_storage(app, client):
    """Banner objects live in object storage, outside the DB — nothing cascades
    them, so `_erase_user` must delete them explicitly using the key embedded in
    `banner_url`."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="banner.erasure@example.com",
        phone="+39099922230",
        username="gdpr_banner_erasure",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.banner_url = "https://cdn.example.com/banners/abc123.jpg"
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    with patch("Tasks.erasure.StorageService.delete") as mock_delete:
        run_erasure.apply()

    mock_delete.assert_called_once_with("abc123.jpg", kind="banner")
    with app.app_context():
        assert db.session.query(User).filter_by(id=UUID(user_id)).first() is None


def test_erasure_task_survives_banner_cleanup_failure(app, client):
    """Storage being unreachable must not block the user's actual erasure — the
    banner cleanup failure is caught and logged, not left to abort `_erase_user`
    (and, per the rubric, the transaction must stay usable afterwards)."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="banner.fail.erasure@example.com",
        phone="+39099922231",
        username="gdpr_banner_fail_erasure",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.banner_url = "https://cdn.example.com/banners/broken.jpg"
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    with patch("Tasks.erasure.StorageService.delete", side_effect=RuntimeError("bucket unreachable")):
        result = run_erasure.apply()

    assert result.get() == {"erased": 1, "failed": 0}
    with app.app_context():
        assert db.session.query(User).filter_by(id=UUID(user_id)).first() is None
        # session must still be usable — no dangling PendingRollbackError
        assert db.session.query(User).count() >= 0


def test_erasure_task_one_failure_does_not_block_other_candidates(app, client, erasure_user):
    """A raised exception for one candidate must not abort the whole beat run —
    `run_erasure` catches per-user, rolls back, and keeps going. Assert the
    failed user survives, the unrelated candidate is still erased, the returned
    counts reflect both outcomes, and the session is left usable."""
    user_id, _ = _register_and_activate(
        app, client,
        mail="flaky.erasure@example.com",
        phone="+39099922230",
        username="gdpr_flaky_erasure",
    )
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        user.deletion_requested_at = datetime.now(timezone.utc) - timedelta(days=31)
        user.active = False
        db.session.commit()

    from Tasks import erasure as erasure_module
    real_erase_user = erasure_module._erase_user

    def flaky_erase(user):
        if str(user.id) == user_id:
            raise RuntimeError("simulated erasure failure")
        return real_erase_user(user)

    with patch("Tasks.erasure._erase_user", side_effect=flaky_erase):
        result = run_erasure.apply()

    assert result.get() == {"erased": 1, "failed": 1}

    with app.app_context():
        # The flaky candidate's failure was rolled back — it must survive.
        assert db.session.query(User).filter_by(id=UUID(user_id)).first() is not None
        # The unrelated, well-behaved candidate must still have been erased.
        assert db.session.query(User).filter_by(id=UUID(erasure_user)).first() is None

    _delete_user(app, user_id)
