"""Auth invariants — structural canary tests over the whole route table.

These tests do not exercise a single endpoint's behaviour; they assert an
architectural contract across every registered route. They exist to catch a
class of silent information-leak bug: a handler that reads ``g.current_user_id``
but is not wrapped by a decorator that populates it. In production such a route
either always sees ``None`` (dead auth path) or — worse — reads an ambient value
left over from another request sharing the application context, leaking private
data to an anonymous caller.

The only decorators allowed to populate ``g.current_user_id`` tag themselves with
``_populates_current_user = True`` (see ``JWTService.authenticate_restful`` and
``authenticate_optional``). If you add a route that reads the current user,
decorate it with one of those — or this canary will fail.
"""
import inspect

from Resources.itinerary_resource import export_gpx


def _wrapper_chain(view):
    """Return every layer of a decorated view, outermost first, down to the handler."""
    chain = []
    fn = view
    while fn is not None:
        chain.append(fn)
        fn = getattr(fn, "__wrapped__", None)
    return chain


def _populates_current_user(view) -> bool:
    """True if any decorator in the chain is tagged as populating g.current_user_id."""
    return any(getattr(layer, "_populates_current_user", False) for layer in _wrapper_chain(view))


def _reads_current_user(view) -> bool:
    """True if the underlying handler's source references current_user_id."""
    handler = _wrapper_chain(view)[-1]
    try:
        source = inspect.getsource(handler)
    except (OSError, TypeError):
        return False
    return "current_user_id" in source


def _iter_views(app):
    for rule in app.url_map.iter_rules():
        view = app.view_functions.get(rule.endpoint)
        if view is not None:
            yield rule.endpoint, view


def test_no_route_reads_current_user_without_populating_decorator(app):
    """Canary: every route that reads g.current_user_id must be wrapped by an auth
    decorator that populates it. A new offender means a silent auth gap."""
    offenders = sorted(
        endpoint
        for endpoint, view in _iter_views(app)
        if _reads_current_user(view) and not _populates_current_user(view)
    )
    assert not offenders, (
        "These routes read g.current_user_id but no decorator in their chain "
        "populates it (silent auth gap — decorate with JWTService.authenticate_restful "
        f"or authenticate_optional): {offenders}"
    )


def test_canary_is_not_vacuous(app):
    """Guard the canary itself: the scan must actually find routes that read the
    current user, otherwise route enumeration or source inspection has silently
    broken and the invariant test above would pass for the wrong reason."""
    readers = [endpoint for endpoint, view in _iter_views(app) if _reads_current_user(view)]
    assert readers, "Expected at least one route to read g.current_user_id; scan found none"


def test_optional_auth_route_is_tagged():
    """Positive control: the one mixed-mode endpoint (anonymous + authenticated)
    is recognised as populating the current user via authenticate_optional."""
    assert _populates_current_user(export_gpx)
    assert _reads_current_user(export_gpx)
