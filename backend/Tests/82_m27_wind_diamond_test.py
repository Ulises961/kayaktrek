"""M27 WP2 — HTTP layer for wind diamonds: create (itinerary-scoped, any
trip member), list/get/patch/delete, with itinerary-membership access
(no creator-only gate, unlike Place — mirrors tidal diamonds). Also guards
the core product requirement: a wind diamond is a static reminder, never
a rate/direction/velocity value."""
from uuid import uuid4

import pytest

from Api.database import db as _db
from Models.wind_diamond import WindDiamond

DIAMOND_BASE = "/api/v1/wind-diamond"


def _body(itinerary, **overrides):
    body = {
        "itineraryId": itinerary["id"],
        "name": "Funnel off the ridge",
        "location": {"type": "Point", "coordinates": [-4.1, 50.3]},
        "notes": "Katabatic gusts reported on NW synoptic flow",
    }
    body.update(overrides)
    return body


def _create(client, headers, itinerary, **overrides):
    return client.post(f"{DIAMOND_BASE}/create", json=_body(itinerary, **overrides), headers=headers)


# ── create ───────────────────────────────────────────────────────────────────

def test_create_returns_201(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["id"]
    assert data["name"] == "Funnel off the ridge"
    assert data["notes"] == "Katabatic gusts reported on NW synoptic flow"
    assert data["location"] == {"type": "Point", "coordinates": [-4.1, 50.3]}


def test_create_sanitizes_name_and_notes(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary, name="  <b>Ridge gap</b>  ", notes="<script>gusty</script>")
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == "Ridge gap"
    assert data["notes"] == "gusty"


def test_create_name_too_long_returns_400(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary, name="x" * 256)
    assert resp.status_code == 400


def test_create_name_and_notes_are_optional(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary, name=None, notes=None)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] is None
    assert data["notes"] is None


def test_create_missing_itinerary_id_returns_400(client, auth_headers, itinerary):
    body = _body(itinerary)
    del body["itineraryId"]
    resp = client.post(f"{DIAMOND_BASE}/create", json=body, headers=auth_headers)
    assert resp.status_code == 400


def test_create_on_unowned_itinerary_returns_403(client, auth_headers_2, itinerary):
    resp = _create(client, auth_headers_2, itinerary)
    assert resp.status_code == 403


def test_create_requires_auth(client, itinerary):
    resp = client.post(f"{DIAMOND_BASE}/create", json=_body(itinerary))
    assert resp.status_code in (401, 403)


def test_create_ignores_rate_direction_velocity_fields(client, auth_headers, itinerary):
    """A wind diamond is a static reminder, never a forecast value — even if a
    client sends rate/direction/velocity data, it must not be stored or echoed."""
    resp = _create(
        client,
        auth_headers,
        itinerary,
        rateKnots=25,
        directionDegrees=270,
        velocityMs=12.5,
        intensity="severe",
    )
    assert resp.status_code == 201
    data = resp.get_json()
    for forbidden_key in ("rateKnots", "directionDegrees", "velocityMs", "intensity", "rate", "direction"):
        assert forbidden_key not in data

    diamond = _db.session.get(WindDiamond, data["id"])
    assert not hasattr(diamond, "rate_knots")
    assert not hasattr(diamond, "direction_degrees")
    assert not hasattr(diamond, "velocity_ms")


# ── list / get ───────────────────────────────────────────────────────────────

def test_list_returns_itinerary_diamonds(client, auth_headers, itinerary):
    _create(client, auth_headers, itinerary)
    _create(client, auth_headers, itinerary, name="Second gap")
    resp = client.get(f"{DIAMOND_BASE}/by-itinerary/{itinerary['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 2


def test_list_unowned_returns_403(client, auth_headers_2, itinerary):
    resp = client.get(f"{DIAMOND_BASE}/by-itinerary/{itinerary['id']}", headers=auth_headers_2)
    assert resp.status_code == 403


def test_get_returns_diamond(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.get(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["id"] == diamond_id


def test_get_nonexistent_returns_404(client, auth_headers):
    resp = client.get(f"{DIAMOND_BASE}/{uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


def test_get_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.get(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers_2)
    assert resp.status_code == 403


# ── patch ────────────────────────────────────────────────────────────────────

def test_patch_renames(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}", json={"name": "Renamed gap"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "Renamed gap"


def test_patch_reposition_updates_location(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(
        f"{DIAMOND_BASE}/{diamond_id}",
        json={"location": {"type": "Point", "coordinates": [-4.5, 50.6]}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["location"]["coordinates"] == pytest.approx([-4.5, 50.6])


def test_patch_nonexistent_returns_404(client, auth_headers):
    resp = client.patch(f"{DIAMOND_BASE}/{uuid4()}", json={"name": "x"}, headers=auth_headers)
    assert resp.status_code == 404


def test_patch_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}", json={"name": "x"}, headers=auth_headers_2)
    assert resp.status_code == 403


# ── delete ───────────────────────────────────────────────────────────────────

def test_delete_removes_diamond(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.delete(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert _db.session.get(WindDiamond, diamond_id) is None


def test_delete_nonexistent_returns_404(client, auth_headers):
    resp = client.delete(f"{DIAMOND_BASE}/{uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


def test_delete_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.delete(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers_2)
    assert resp.status_code == 403


# ── membership-based access: unlike Place, there is no creator-only gate ─────

def test_crew_member_can_edit_and_delete_another_members_diamond(
    client, trip_with_user2_as_crew
):
    """Wind diamonds mirror tidal diamonds' access model: itinerary membership
    grants full read/write, not just the creator (Place's stricter rule does not
    apply here — see the WP2 commit)."""
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    itinerary = {"id": trip_with_user2_as_crew["trip"]["itinerary"]["id"]}

    diamond_id = _create(client, leader, itinerary).get_json()["id"]

    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}", json={"name": "Crew renamed"}, headers=crew)
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "Crew renamed"

    assert client.delete(f"{DIAMOND_BASE}/{diamond_id}", headers=crew).status_code == 200
