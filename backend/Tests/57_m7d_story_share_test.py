"""M7d §2 — unlisted trip-story share token.

Independent of is_public/explore discoverability (M7c): any itinerary, public or
private, can generate an unlisted link. Regenerating invalidates the previous
token (no separate revoke endpoint), mirroring Logistics.share_token.
"""
import pytest

from Api.database import db
from Models.itinerary import Itinerary
from Resources.itinerary_resource import ITINERARY_ENDPOINT


@pytest.fixture
def make_private_itinerary(app, user_1):
    created = []

    def _make():
        itinerary = Itinerary(name="Private trip", is_public=False, user_id=user_1.id)
        db.session.add(itinerary)
        db.session.commit()
        created.append(itinerary)
        return itinerary

    yield _make

    for itinerary in created:
        db.session.query(Itinerary).filter_by(id=itinerary.id).delete(synchronize_session=False)
    db.session.commit()


def test_generate_story_share_requires_auth(client, make_private_itinerary):
    itinerary = make_private_itinerary()
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share")
    assert r.status_code in (401, 403)


def test_generate_story_share_rejects_non_owner(client, make_private_itinerary, auth_headers_2):
    itinerary = make_private_itinerary()
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers_2)
    assert r.status_code == 403


def test_generate_story_share_returns_token_to_owner(client, make_private_itinerary, auth_headers):
    itinerary = make_private_itinerary()
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers)
    assert r.status_code == 200
    assert r.json["storyShareToken"]


def test_story_token_works_even_for_private_itinerary(client, make_private_itinerary, auth_headers):
    itinerary = make_private_itinerary()
    generated = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers
    ).json
    token = generated["storyShareToken"]

    # Not discoverable via the public/explore path...
    assert client.get(f"{ITINERARY_ENDPOINT}/{itinerary.id}/public").status_code == 404
    # ...but reachable via the unlisted token.
    r = client.get(f"{ITINERARY_ENDPOINT}/story/public/{token}")
    assert r.status_code == 200
    assert r.json["name"] == "Private trip"


def test_regenerating_invalidates_previous_token(client, make_private_itinerary, auth_headers):
    itinerary = make_private_itinerary()
    first = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers
    ).json["storyShareToken"]
    second = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers
    ).json["storyShareToken"]

    assert first != second
    assert client.get(f"{ITINERARY_ENDPOINT}/story/public/{first}").status_code == 404
    assert client.get(f"{ITINERARY_ENDPOINT}/story/public/{second}").status_code == 200


def test_unknown_token_returns_generic_404(client):
    r = client.get(f"{ITINERARY_ENDPOINT}/story/public/does-not-exist")
    assert r.status_code == 404


def test_story_share_payload_excludes_private_fields(client, make_private_itinerary, auth_headers):
    """Story payloads must not leak trip-level private data like crew contacts or medical notes."""
    itinerary = make_private_itinerary()
    token = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers
    ).json["storyShareToken"]

    r = client.get(f"{ITINERARY_ENDPOINT}/story/public/{token}")
    assert r.status_code == 200
    payload = r.json

    # Verify no trip data leaks into the public story payload
    assert "tripId" not in payload
    assert "userId" not in payload
    assert "trip" not in payload
    # The payload should only contain itinerary and route data
    assert "name" in payload
    assert "id" in payload
