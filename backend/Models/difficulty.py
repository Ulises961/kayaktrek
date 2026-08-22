import enum

from sqlalchemy import Enum


class DifficultyType(enum.Enum):
    EASY = "easy"
    MODERATE = "moderate"
    DEMANDING = "demanding"
    EXPERT = "expert"


# Derived from the enum, never retyped — the explore filter validates against this
# the way the season facet validates against VALID_SEASONS.
VALID_DIFFICULTIES = frozenset(member.value for member in DifficultyType)


# One shared type object, reused by Trip.difficulty and Itinerary.difficulty. Both
# columns must resolve to the same Postgres enum, and Tests/conftest.py builds the
# schema with create_all(checkfirst=False) — two separate Enum(DifficultyType)
# instances would each issue CREATE TYPE for the same name and the second would fail.
# values_callable stores the values ("easy"), not the member names ("EASY").
difficulty_enum = Enum(
    DifficultyType,
    name="difficultytype",
    values_callable=lambda obj: [member.value for member in obj],
)
