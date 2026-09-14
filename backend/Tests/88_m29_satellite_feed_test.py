"""M29 WP1 — satellite feed registration (profile-level, not trip-scoped): create,
list, update (clears needsReauth), delete, per-user isolation, and that a stored
password is never echoed back."""
import pytest

from Api.database import db as _db
from Models.satellite_feed import SatelliteFeed

FEED_BASE = "/api/v1/satellite-feeds"


@pytest.fixture(autouse=True)
def _cleanup_feeds(app):
    # auth_headers/auth_headers_2 are session-scoped (same user_1/user_2 across the
    # whole file), but SatelliteFeed enforces one row per (user, provider) — without
    # this, the second test to register "inreach_mapshare" for the same user 409s
    # against a row a prior test left behind rather than testing what it means to.
    yield
    with app.app_context():
        _db.session.query(SatelliteFeed).delete()
        _db.session.commit()


def _body(**overrides):
    body = {
        "provider": "inreach_mapshare",
        "feedUrl": "https://share.garmin.com/Feed/Share/testfeed",
    }
    body.update(overrides)
    return body


# ── create ───────────────────────────────────────────────────────────────────

def test_create_returns_201(client, auth_headers):
    resp = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["id"]
    assert data["provider"] == "inreach_mapshare"
    assert data["feedUrl"] == "https://share.garmin.com/Feed/Share/testfeed"
    assert data["needsReauth"] is False
    assert "feedPassword" not in data


def test_create_stores_password_encrypted_not_plaintext(client, auth_headers, app):
    resp = client.post(
        f"{FEED_BASE}/create",
        json=_body(feedUsername="paddler", feedPassword="s3cret"),
        headers=auth_headers,
    )
    assert resp.status_code == 201
    feed_id = resp.get_json()["id"]

    with app.app_context():
        feed = _db.session.query(SatelliteFeed).filter_by(id=feed_id).first()
        assert feed.feed_password_ciphertext is not None
        assert feed.feed_password_ciphertext != "s3cret"


def test_create_rejects_non_https_url(client, auth_headers):
    resp = client.post(f"{FEED_BASE}/create", json=_body(feedUrl="http://insecure.example/feed"), headers=auth_headers)
    assert resp.status_code == 400


def test_create_duplicate_provider_returns_409(client, auth_headers):
    resp1 = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers)
    assert resp1.status_code == 201
    resp2 = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers)
    assert resp2.status_code == 409


# ── list ─────────────────────────────────────────────────────────────────────

def test_list_returns_only_caller_feeds(client, auth_headers, auth_headers_2):
    client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers)

    resp_owner = client.get(f"{FEED_BASE}/all", headers=auth_headers)
    resp_other = client.get(f"{FEED_BASE}/all", headers=auth_headers_2)

    assert resp_owner.status_code == 200
    assert any(f["feedUrl"] == "https://share.garmin.com/Feed/Share/testfeed" for f in resp_owner.get_json())
    assert all(f["feedUrl"] != "https://share.garmin.com/Feed/Share/testfeed" for f in resp_other.get_json())


# ── update ───────────────────────────────────────────────────────────────────

def test_update_changes_url_and_clears_needs_reauth(client, auth_headers, app):
    created = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers).get_json()
    feed_id = created["id"]

    with app.app_context():
        feed = _db.session.query(SatelliteFeed).filter_by(id=feed_id).first()
        feed.needs_reauth = True
        _db.session.commit()

    resp = client.patch(
        f"{FEED_BASE}/{feed_id}",
        json={"feedUrl": "https://share.garmin.com/Feed/Share/renewed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["feedUrl"] == "https://share.garmin.com/Feed/Share/renewed"
    assert data["needsReauth"] is False


def test_update_someone_elses_feed_returns_404(client, auth_headers, auth_headers_2):
    created = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers).get_json()
    resp = client.patch(
        f"{FEED_BASE}/{created['id']}",
        json={"feedUrl": "https://share.garmin.com/Feed/Share/hijacked"},
        headers=auth_headers_2,
    )
    assert resp.status_code == 404


# ── delete ───────────────────────────────────────────────────────────────────

def test_delete_removes_feed(client, auth_headers):
    created = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers).get_json()
    resp = client.delete(f"{FEED_BASE}/{created['id']}", headers=auth_headers)
    assert resp.status_code == 200

    listing = client.get(f"{FEED_BASE}/all", headers=auth_headers).get_json()
    assert all(f["id"] != created["id"] for f in listing)


def test_delete_someone_elses_feed_returns_404(client, auth_headers, auth_headers_2):
    created = client.post(f"{FEED_BASE}/create", json=_body(), headers=auth_headers).get_json()
    resp = client.delete(f"{FEED_BASE}/{created['id']}", headers=auth_headers_2)
    assert resp.status_code == 404


# ── auth ─────────────────────────────────────────────────────────────────────

def test_endpoints_require_auth(client):
    # 401 (invalid/missing token) vs 403 (missing token entirely) — Tests/12_security_test.py
    # accepts either for this boundary; JWTService's own behavior is the source of truth.
    assert client.get(f"{FEED_BASE}/all").status_code in (401, 403)
    assert client.post(f"{FEED_BASE}/create", json=_body()).status_code in (401, 403)
