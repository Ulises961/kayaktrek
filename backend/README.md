# Backend

Flask REST API for the Kayak Expedition Planner. Handles authentication, trip management, itinerary planning, inventory, logs, and weather/sea data.

## Setup

```bash
pipenv install
cp .env.example .env    # fill in DB URI, JWT secret, Flask host
pipenv run python -m Api.app
```

## API overview

All endpoints are prefixed `/api/`. Authentication via `Authorization: Bearer <token>` (JWT). Login and register are the only public endpoints.

| Resource | Base path | Key operations |
|----------|-----------|---------------|
| Auth | `/api/auth` | login, register, refresh token |
| User | `/api/user` | get, update, delete |
| Trip | `/api/trip` | CRUD, invite members, accept/reject invitations |
| Itinerary | `/api/itinerary` | CRUD, days managed within |
| Day | `/api/day` | CRUD per itinerary, composite key lookup |
| Point | `/api/point` | CRUD, POI range query |
| Inventory | `/api/inventory` | CRUD per user or trip |
| Item | `/api/item` | CRUD, category and checked status |
| Log | `/api/log` | CRUD, endorse/unendorse |

## Data model

```
User ──< Trip                  (M2M via user_has_trip)
User ──< Trip (pending)        (M2M via user_has_invitation, with expiration_date)
Trip ──1 Itinerary ──< Day ──< Point  (all cascade delete)
Day ──1 Weather ──< WeatherState
Day ──1 Sea ──< SeaState
Trip ──1 Inventory ──< Item
User ──< Log                   (personal paddling records)
User ──< Log (endorsed)        (M2M via user_endorses_log)
Point.next_id → Point.id       (self-referencing linked list — route order)
Point ──< Image                (M2M via point_has_image)
```

## Authentication

JWT-based with short-lived access tokens (15 min) and long-lived refresh tokens (30 days). Every protected endpoint checks the token via `JWTService.authenticate_restful` and authorisation via `@require_owner(resource_type)`.

## Running tests

```bash
pipenv run pytest
```

Tests in `Tests/` are numbered and ordered — earlier tests create state used by later ones.

## Migrations

```bash
pipenv run flask --app Api.app db migrate -m "description"
pipenv run flask --app Api.app db upgrade
```

For how to contribute and where the architecture decisions are recorded, see [CONTRIBUTING.md](../CONTRIBUTING.md) and `docs/adr/`.
