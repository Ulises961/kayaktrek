# ADR-014: Flask thin resources — business logic lives in the service layer

**Status**: accepted
**Date**: 2025-01-01

## Context

Flask does not prescribe where business logic lives. Without a convention, logic gravitates toward route handlers, making it untestable, duplicated across endpoints, and mixed with HTTP concerns (request parsing, response serialisation, status codes).

The application has a meaningful domain — trip state transitions, GDPR erasure contracts, float plan consent cascades — that requires testable, reusable business logic.

## Decision

Resources (Flask Blueprints in `Resources/`) are **thin HTTP adapters**. Their only responsibilities are:

1. Parse and validate the incoming request (JSON body, query params, path variables)
2. Call the relevant service method with plain Python arguments
3. Return a JSON response with the appropriate status code

No business logic, no database queries, no conditional branching on domain state belongs in a resource file. If a resource method is more than ~15 lines, it is probably doing too much.

**Service layer** (`Services/`) owns all business logic. Services:
- Are plain Python classes with static methods — no Flask imports, no HTTP concerns
- Interact with the database via SQLAlchemy directly
- Raise domain exceptions (`ValueError`, `PermissionError`, `NoResultFound`) that resources catch and map to HTTP status codes
- Are the correct place to test: integration tests call service methods directly, bypassing HTTP entirely where possible

**Schemas** (`Schemas/`) handle serialisation and deserialisation via Marshmallow. Ownership stamping (`user_id`, `inventory_id`) is done in `@post_load` on the schema — never re-derived in a resource or service method.

## Consequences

**Positive**
- Business logic is testable without an HTTP client — service methods can be called directly in tests
- Adding a new endpoint for existing behaviour is trivial — call the existing service method
- HTTP status code mapping is localised to the resource; services never know they are being called over HTTP
- Circular import risk is low — services import from `Api/database.py` and models, never from resources or the app factory

**Negative / trade-offs**
- More files and indirection than a single-file Flask app — justified at this domain complexity, but the pattern must be explained to new contributors
- Marshmallow + SQLAlchemy + Flask is three layers of abstraction on every request path; errors that cross layers (e.g. a Marshmallow `ValidationError` not caught in a resource) can produce unexpected HTTP 500s if error handlers are not comprehensive

**Risks / open questions**
- The convention must be enforced in code review — Flask makes it easy to put a database query directly in a route handler, and the path of least resistance is always the wrong one here
- Celery tasks (`Tasks/`) follow the same principle: they call service methods, never implement logic themselves
