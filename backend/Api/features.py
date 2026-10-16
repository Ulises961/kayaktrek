"""Feature gates for surfaces that exist in the codebase but are not currently offered.

A parked feature is not a dead one: the models, services, endpoints and tests all stay,
and a deployment turns the surface back on with a single environment variable. What the
gate buys is that the *hosted* app stops accepting the data while the decision is parked.

`404` rather than `403` on purpose. A parked endpoint should be indistinguishable from
one that was never built — a `403` advertises that the route exists and invites someone
to come back and probe it, which is the opposite of what parking is for.
"""

from functools import wraps
from http import HTTPStatus
from typing import Any, Callable

from flask import abort, current_app


def require_medical_notes(view: Callable[..., Any]) -> Callable[..., Any]:
    """404 every medical-notes endpoint unless `MEDICAL_NOTES_ENABLED` is set.

    Stack this directly under `@blueprint.route(...)`, above the auth decorators, so an
    unauthenticated probe gets the same 404 as an authenticated one — a route that 403s
    for anonymous callers and 404s for signed-in ones still leaks that it is there.

    `functools.wraps` matters here beyond tidiness: `Api/openapi.py` reads the
    `_auth_required` marker that `JWTService.authenticate_restful` sets on its own
    wrapper, and relies on `wraps` copying `__dict__` outward through every stacked
    decorator. Dropping it would silently strip `security: bearerAuth` from these paths
    in the published spec.
    """

    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        if not current_app.config.get("MEDICAL_NOTES_ENABLED"):
            abort(HTTPStatus.NOT_FOUND)
        return view(*args, **kwargs)

    # Read by Api/openapi.py, which omits gated paths from the published contract while
    # their flag is off. Set after @wraps, which would otherwise copy the wrapped view's
    # __dict__ over it.
    wrapper._feature_flag = "MEDICAL_NOTES_ENABLED"  # type: ignore[attr-defined]
    return wrapper
