# ADR-002: PostgreSQL with PostGIS for the primary database

**Status**: accepted
**Date**: 2025-01-01

## Context

The application needs a relational database for user data, trips, itineraries, and gear. It also needs geospatial capability for:
- POI (point-of-interest) range queries — "find POIs within N km of this coordinate"
- Potential future route geometry storage and spatial queries on itinerary points

## Decision

Use **PostgreSQL** as the primary database with the **PostGIS** extension enabled.

Geospatial columns use `Geography(Point, 4326)` (WGS84 lat/lng) via GeoAlchemy2. Range queries use `ST_DWithin` + `ST_Distance`.

## Consequences

**Positive**
- PostGIS is the industry standard for open-source geospatial — mature, well-documented
- No need for a separate geospatial store or external geocoding service for proximity queries
- SQLAlchemy + GeoAlchemy2 integrates cleanly with the existing ORM layer

**Negative / trade-offs**
- PostGIS requires the `postgis` Docker image variant in compose and in production — slightly heavier than plain Postgres
- GeoAlchemy2 adds a dependency; spatial queries are less readable than plain SQL

**Risks / open questions**
- Spatial indexes (`GIST`) must be created explicitly in migrations — easy to forget
- Route geometry (full line strings for a day's track) not yet modelled; may need `Geometry(LineString)` columns in M4+
