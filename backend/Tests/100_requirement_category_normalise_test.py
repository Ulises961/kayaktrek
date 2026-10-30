"""The data repair behind `45087e1ceeea`: a requirement category typed by hand becomes the slug.

The add-requirement form used to take the category as free text, so "First aid", "first aid" and
"FIRST_AID" were each stored as typed and each made its own group on the checklist. The migration
maps every stored value that is an item category's slug or name, in any case, to the slug, and
leaves everything else exactly as it is.

The migration is loaded by path because `alembic/versions/` is not an importable package.
"""
import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import select

from Api.database import db as _db
from Models.trip_requirement import TripRequirement

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "45087e1ceeea_map_requirement_categories_typed_by_.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("_category_migration", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = _load()


def _requirements_of(trip):
    inventory_id = trip["inventory"]["id"]
    return list(
        _db.session.execute(
            select(TripRequirement).where(TripRequirement.inventory_id == inventory_id)
        ).scalars()
    )


def _store_category(requirement, category):
    requirement.category = category
    _db.session.commit()


def _normalise():
    migration.normalise_requirement_categories(_db.session.connection())
    _db.session.commit()
    _db.session.expire_all()


@pytest.mark.parametrize(
    "typed",
    ["first_aid", "First Aid", "first aid", " FIRST AID ", "First_Aid"],
)
def test_a_slug_or_name_in_any_case_becomes_the_slug(trip_w_o_itinerary, typed):
    requirement = _requirements_of(trip_w_o_itinerary)[0]
    _store_category(requirement, typed)

    _normalise()

    assert _db.session.get(TripRequirement, requirement.id).category == "first_aid"


def test_free_text_that_matches_no_category_is_left_alone(trip_w_o_itinerary):
    requirement = _requirements_of(trip_w_o_itinerary)[0]
    _store_category(requirement, "Safety kit")

    _normalise()

    assert _db.session.get(TripRequirement, requirement.id).category == "Safety kit"


def test_a_blank_category_and_a_missing_one_stay_as_they_are(trip_w_o_itinerary):
    first, second = _requirements_of(trip_w_o_itinerary)[:2]
    _store_category(first, None)
    _store_category(second, "")

    _normalise()

    assert _db.session.get(TripRequirement, first.id).category is None
    assert _db.session.get(TripRequirement, second.id).category == ""


def test_a_requirement_already_on_its_slug_is_not_touched(trip_w_o_itinerary):
    """`updated` is what mobile's pull reads, so a row that needs no change must not move it."""
    requirement = _requirements_of(trip_w_o_itinerary)[0]
    _store_category(requirement, "gear")
    before = _db.session.get(TripRequirement, requirement.id).updated

    _normalise()

    assert _db.session.get(TripRequirement, requirement.id).updated == before


def test_a_changed_requirement_moves_updated_so_phones_pull_it(trip_w_o_itinerary):
    requirement = _requirements_of(trip_w_o_itinerary)[0]
    _store_category(requirement, "Gear")
    before = _db.session.get(TripRequirement, requirement.id).updated

    _normalise()

    assert _db.session.get(TripRequirement, requirement.id).updated > before


def test_running_it_twice_changes_nothing_more(trip_w_o_itinerary):
    requirement = _requirements_of(trip_w_o_itinerary)[0]
    _store_category(requirement, "First Aid")
    _normalise()
    after_first = _db.session.get(TripRequirement, requirement.id).updated

    _normalise()

    row = _db.session.get(TripRequirement, requirement.id)
    assert (row.category, row.updated) == ("first_aid", after_first)
