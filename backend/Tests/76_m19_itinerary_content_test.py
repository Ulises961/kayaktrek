"""M19 §1 — Itinerary.description and Itinerary.difficulty.

The public shape reads Itinerary with no trip data attached (ADR-012/026), so a route's
pitch and its difficulty cannot live on Trip and still be published. Both are added to
Itinerary; Trip keeps its own two fields for a different audience. The link between them
is a one-time copy at creation, never a sync — several tests below exist specifically to
hold that line, because a "helpful" later change that keeps them in step would silently
republish a private crew brief.
"""
import json

import pytest

from Api.database import db
from Models.difficulty import DifficultyType
from Models.itinerary import Itinerary
from Models.trip import Trip
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT

EXPLORE = f"{ITINERARY_ENDPOINT}/explore"


@pytest.fixture
def trip_with_brief(client, auth_headers):
    """A trip carrying a private crew brief in Trip.description."""
    response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "description": "Meet at the slip at 07:00. Ana has the keys."},
        headers=auth_headers,
    )
    assert response.status_code == 201
    trip_data = json.loads(response.data)
    yield trip_data
    client.delete(f"{TRIP_ENDPOINT}/{trip_data['id']}", headers=auth_headers)


# ── copy-on-create ────────────────────────────────────────────────────────────

def test_create_seeds_description_from_trip(client, auth_headers, trip_with_brief):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"tripId": trip_with_brief["id"], "name": "Cinque Terre"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json["description"] == "Meet at the slip at 07:00. Ana has the keys."


def test_explicit_description_is_not_overwritten_by_the_trip(
    client, auth_headers, trip_with_brief
):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={
            "tripId": trip_with_brief["id"],
            "name": "Cinque Terre",
            "description": "Sheltered coast hop, two easy days.",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json["description"] == "Sheltered coast hop, two easy days."


def test_editing_the_itinerary_description_leaves_the_trip_untouched(
    app, client, auth_headers, trip_with_brief
):
    """The copy is not a link — this is the guarantee that keeps a private brief private."""
    created = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"tripId": trip_with_brief["id"], "name": "Cinque Terre"},
        headers=auth_headers,
    )
    itinerary_id = created.json["id"]

    patched = client.patch(
        f"{ITINERARY_ENDPOINT}/{itinerary_id}",
        json={"description": "Rewritten as a public pitch."},
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json["description"] == "Rewritten as a public pitch."

    with app.app_context():
        trip = db.session.get(Trip, trip_with_brief["id"])
        assert trip.description == "Meet at the slip at 07:00. Ana has the keys."


def test_standalone_itinerary_needs_no_trip_to_carry_a_description(client, auth_headers):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Solo paddle", "description": "Out and back from the harbour."},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json["description"] == "Out and back from the harbour."


# ── validation + sanitization ─────────────────────────────────────────────────

def test_description_is_stripped_of_markup_and_trimmed(client, auth_headers):
    """bleach(tags=[], strip=True) removes the tags but keeps their inner text, so
    "<script>alert('x')</script>Lovely" lands as "alert('x')Lovely" — inert text the
    frontend escapes on render, and the same behaviour Trip.description already has.
    What must hold is that no markup survives to be interpreted."""
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={
            "name": "Sanitised",
            "description": "  <b>Bold</b> and <a href='#'>linked</a>  ",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    stored = response.json["description"]
    assert "<" not in stored and ">" not in stored
    assert stored == "Bold and linked"


def test_description_over_2000_chars_is_rejected(client, auth_headers):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Too long", "description": "x" * 2001},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_difficulty_accepts_a_valid_value_and_rejects_an_invalid_one(client, auth_headers):
    ok = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Graded", "difficulty": "demanding"},
        headers=auth_headers,
    )
    assert ok.status_code == 201
    assert ok.json["difficulty"] == "demanding"

    bad = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Ungradeable", "difficulty": "impossible"},
        headers=auth_headers,
    )
    assert bad.status_code == 400


def test_difficulty_round_trips_as_its_value_not_its_member_name(app, client, auth_headers):
    """values_callable guard: without it SQLAlchemy stores 'EXPERT', not 'expert'."""
    created = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Expert route", "difficulty": "expert"},
        headers=auth_headers,
    )
    with app.app_context():
        stored = db.session.execute(
            db.text("SELECT difficulty::text FROM itinerary WHERE id = :id"),
            {"id": created.json["id"]},
        ).scalar()
    assert stored == "expert"


# ── the public projection ─────────────────────────────────────────────────────

def test_public_itinerary_exposes_description_and_difficulty(app, client, auth_headers):
    created = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={
            "name": "Public route",
            "description": "Two sheltered days with a shingle put-in.",
            "difficulty": "moderate",
        },
        headers=auth_headers,
    )
    itinerary_id = created.json["id"]
    client.patch(
        f"{ITINERARY_ENDPOINT}/{itinerary_id}",
        json={"isPublic": True},
        headers=auth_headers,
    )

    try:
        # No credentials at all — the anonymous jar, not a stale one.
        response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}/public")
        assert response.status_code == 200
        assert response.json["description"] == "Two sheltered days with a shingle put-in."
        assert response.json["difficulty"] == "moderate"
    finally:
        # This route is public, so leaving it behind would show up in every explore
        # assertion below — and it is `moderate`, the same grade one of them filters on.
        with app.app_context():
            db.session.query(Itinerary).filter_by(id=itinerary_id).delete(
                synchronize_session=False
            )
            db.session.commit()


def test_a_trips_grade_and_brief_never_reach_the_public_row(
    app, client, auth_headers, trip_with_brief
):
    """The two pairs of same-named fields must stay disconnected.

    The trip here is `expert` with a private brief; its itinerary is deliberately left
    ungraded and its seeded description overwritten. If a later change ever resolves
    the public row's difficulty by falling back to the parent Trip — the "helpful"
    join that looks like a bug fix — this goes red.
    """
    client.patch(
        f"{TRIP_ENDPOINT}/{trip_with_brief['id']}",
        json={"difficulty": "expert"},
        headers=auth_headers,
    )
    created = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={
            "tripId": trip_with_brief["id"],
            "name": "Ungraded route",
            "description": "A public pitch that is not the crew brief.",
        },
        headers=auth_headers,
    )
    itinerary_id = created.json["id"]
    client.patch(
        f"{ITINERARY_ENDPOINT}/{itinerary_id}",
        json={"isPublic": True},
        headers=auth_headers,
    )

    try:
        response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}/public")
        assert response.status_code == 200
        assert response.json["difficulty"] is None
        assert response.json["description"] == "A public pitch that is not the crew brief."
        assert "Ana has the keys" not in json.dumps(response.json)
    finally:
        with app.app_context():
            db.session.query(Itinerary).filter_by(id=itinerary_id).delete(
                synchronize_session=False
            )
            db.session.commit()


# ── forking ───────────────────────────────────────────────────────────────────

def test_fork_carries_the_pitch_and_the_grade(
    app, client, auth_headers, auth_headers_2, user_1
):
    """Route-describing fields travel with the route — they describe the paddling,
    not the trip that happened to produce them."""
    source = Itinerary(
        name="Forkable coast",
        is_public=True,
        user_id=user_1.id,
        description="Committing outer passage, no escape for 11 km.",
        difficulty=DifficultyType.EXPERT,
    )
    db.session.add(source)
    db.session.commit()
    source_id = str(source.id)

    fork_id = None
    try:
        response = client.post(
            f"{ITINERARY_ENDPOINT}/{source_id}/fork", headers=auth_headers_2
        )
        assert response.status_code == 201
        fork_id = response.json["itineraryId"]

        with app.app_context():
            fork = db.session.get(Itinerary, fork_id)
            assert fork.description == "Committing outer passage, no escape for 11 km."
            assert fork.difficulty is DifficultyType.EXPERT
            # The copy is private and attributed, not a second public listing.
            assert fork.is_public is False
            assert str(fork.created_from_id) == source_id
    finally:
        with app.app_context():
            for stale_id in (fork_id, source_id):
                if stale_id:
                    db.session.query(Itinerary).filter_by(id=stale_id).delete(
                        synchronize_session=False
                    )
            db.session.commit()


# ── explore filtering ─────────────────────────────────────────────────────────

@pytest.fixture
def graded_routes(app, user_1):
    """Three public routes, one per difficulty, built straight in the DB."""
    created = []
    for name, level in (
        ("Easy bay", DifficultyType.EASY),
        ("Moderate headland", DifficultyType.MODERATE),
        ("Expert race", DifficultyType.EXPERT),
    ):
        itinerary = Itinerary(
            name=name,
            is_public=True,
            user_id=user_1.id,
            difficulty=level,
            description=f"{name} pitch.",
        )
        db.session.add(itinerary)
        created.append(itinerary)
    db.session.commit()
    yield created
    for itinerary in created:
        db.session.query(Itinerary).filter_by(id=itinerary.id).delete(
            synchronize_session=False
        )
    db.session.commit()


def _graded_names(response):
    """Only the three routes this file created.

    Explore is a global listing — the seeded demo itinerary and anything another test
    file left public also land in it. Asserting on the full page would make these
    tests fail for reasons that have nothing to do with the difficulty facet.
    """
    wanted = {"Easy bay", "Moderate headland", "Expert race"}
    return sorted(
        item["name"] for item in response.json["items"] if item["name"] in wanted
    )


def test_explore_filters_by_difficulty(client, graded_routes):
    response = client.get(f"{EXPLORE}?difficulty=expert")
    assert response.status_code == 200
    assert _graded_names(response) == ["Expert race"]


def test_explore_accepts_several_difficulties(client, graded_routes):
    response = client.get(f"{EXPLORE}?difficulty=easy&difficulty=expert")
    assert _graded_names(response) == ["Easy bay", "Expert race"]


def test_explore_ignores_an_unknown_difficulty_rather_than_erroring(client, graded_routes):
    """A stale bookmark should still return a usable page, as the season facet does."""
    response = client.get(f"{EXPLORE}?difficulty=impossible")
    assert response.status_code == 200
    assert _graded_names(response) == ["Easy bay", "Expert race", "Moderate headland"]


def test_explore_rows_carry_the_pitch_and_the_grade(client, graded_routes):
    response = client.get(f"{EXPLORE}?difficulty=moderate")
    item = next(
        row for row in response.json["items"] if row["name"] == "Moderate headland"
    )
    assert item["description"] == "Moderate headland pitch."
    assert item["difficulty"] == "moderate"
