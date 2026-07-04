"""Hemisphere-aware season derivation for public route discovery (M7c).

Season is a *derived* facet of a public itinerary — inferred from its days' calendar
dates and the route's latitude — never stored. A June paddle is summer in the northern
hemisphere but winter in the southern, so every mapping takes a representative latitude.
"""

VALID_SEASONS = frozenset({"winter", "spring", "summer", "autumn"})

# Calendar months for each season in the NORTHERN hemisphere.
_NORTHERN_MONTHS = {
    "winter": {12, 1, 2},
    "spring": {3, 4, 5},
    "summer": {6, 7, 8},
    "autumn": {9, 10, 11},
}

# The same calendar months name the opposite season in the southern hemisphere.
_OPPOSITE = {
    "winter": "summer",
    "summer": "winter",
    "spring": "autumn",
    "autumn": "spring",
}


def season_months(seasons, hemisphere_lat: float) -> set:
    """Calendar months (1-12) that count as in-season for the requested seasons.

    Unknown tokens are ignored. `hemisphere_lat >= 0` is treated as northern.
    """
    months: set = set()
    for season in seasons or []:
        token = str(season).strip().lower()
        if token not in VALID_SEASONS:
            continue
        northern_season = token if hemisphere_lat >= 0 else _OPPOSITE[token]
        months |= _NORTHERN_MONTHS[northern_season]
    return months


def season_of(month: int, hemisphere_lat: float) -> str:
    """The season name a calendar month falls in, for the given hemisphere."""
    northern_season = next(
        name for name, months in _NORTHERN_MONTHS.items() if month in months
    )
    return northern_season if hemisphere_lat >= 0 else _OPPOSITE[northern_season]
