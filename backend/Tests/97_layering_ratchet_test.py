"""Layering ratchets — structural canaries over the source tree.

``coding-rules`` says resources are thin HTTP adapters, that unexpected errors travel to
``Api/error_handlers.py``, and that services know nothing of HTTP. Prose does not hold a rule
by itself, so this file counts the violations that already exist and fails when the count moves
in *either* direction:

- It went up: a new violation. Fix the code, not the number.
- It went down: good — lower the baseline below in the same commit, so the number keeps
  describing the code and the ratchet only ever tightens.

Counts come from the AST, not a text search, so comments and strings cannot move them. When a
baseline dictionary is empty the rule is simply enforced. See ``plans/M37-discipline-pass.md``.
"""
import ast
import configparser
import fnmatch
from pathlib import Path
from typing import Callable

BACKEND_ROOT = Path(__file__).resolve().parent.parent
RESOURCES_DIR = BACKEND_ROOT / "Resources"
SERVICES_DIR = BACKEND_ROOT / "Services"
TESTS_DIR = BACKEND_ROOT / "Tests"

# `except Exception` / `except BaseException` / bare `except:` in a resource. The central
# handlers already return a generic 500, log the traceback and roll the session back, so a
# resource only keeps one where it must answer with something other than a 500:
#   - health_resource: a failed database ping is a 503, which is what an orchestrator acts on.
#   - live_resource: an unreadable change log is a 503 with Retry-After, so clients back off.
BROAD_EXCEPT_HANDLERS = {
    "health_resource.py": 1,
    "live_resource.py": 1,
}

# `abort(500, ...)` / `abort(HTTPStatus.INTERNAL_SERVER_ERROR, ...)`: a resource declaring an
# error it caught, which discards the traceback. `abort` is for decisions, not exceptions.
ABORT_500_CALLS: dict[str, int] = {}

# `db.session` in a resource: a query that belongs in the service owning the entity.
DB_SESSION_USES = {
    "authentication_resource.py": 2,
    "catalog_item_resource.py": 1,
    "health_resource.py": 1,
    "item_category_resource.py": 1,
    "item_resource.py": 1,
    "itinerary_resource.py": 4,
    "live_resource.py": 1,
    "log_resource.py": 4,
    "point_resource.py": 1,
    "sea_resource.py": 1,
}

# Resources that import `Api.database` or `Models.*` at all.
DATA_LAYER_IMPORTERS = frozenset(
    {
        "authentication_resource.py",
        "catalog_item_resource.py",
        "health_resource.py",
        "item_category_resource.py",
        "item_resource.py",
        "itinerary_resource.py",
        "live_resource.py",
        "log_resource.py",
        "point_resource.py",
        "sea_resource.py",
        "user_resource.py",
    }
)

BROAD_EXCEPTION_NAMES = frozenset({"Exception", "BaseException"})

# Flask names a service may import: the caller's identity, config, and mail templates.
# Everything else on the request/response side belongs to a resource or to middleware.
SERVICE_FLASK_ALLOWED = frozenset({"g", "current_app", "render_template"})
# Middleware and the client-identity helper exist to read the request.
SERVICE_HTTP_EXEMPT = ("Middleware/", "Utils/client_identity.py")


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(), filename=str(path))


def _is_broad_handler(handler: ast.ExceptHandler) -> bool:
    if handler.type is None:
        return True
    caught = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return any(isinstance(name, ast.Name) and name.id in BROAD_EXCEPTION_NAMES for name in caught)


def _is_abort_500(call: ast.Call) -> bool:
    if not (isinstance(call.func, ast.Name) and call.func.id == "abort" and call.args):
        return False
    status = call.args[0]
    if isinstance(status, ast.Constant):
        return status.value == 500
    return isinstance(status, ast.Attribute) and status.attr == "INTERNAL_SERVER_ERROR"


def _is_db_session(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and node.attr == "session"
        and isinstance(node.value, ast.Name)
        and node.value.id == "db"
    )


def _imports_data_layer(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            if node.module == "Api.database" or node.module.split(".")[0] == "Models":
                return True
        if isinstance(node, ast.Import) and any(alias.name.split(".")[0] == "Models" for alias in node.names):
            return True
    return False


def _count_per_resource(count: Callable[[ast.Module], int]) -> dict[str, int]:
    """Non-zero counts keyed by resource file name, comparable with a baseline dictionary."""
    counts = {path.name: count(_parse(path)) for path in sorted(RESOURCES_DIR.glob("*.py"))}
    return {name: found for name, found in counts.items() if found}


def _assert_ratchet(rule: str, actual: dict[str, int], baseline: dict[str, int], remedy: str) -> None:
    grew = [
        f"{name}: {baseline.get(name, 0)} -> {found}"
        for name, found in actual.items()
        if found > baseline.get(name, 0)
    ]
    shrank = [
        f"{name}: {allowed} -> {actual.get(name, 0)}"
        for name, allowed in baseline.items()
        if actual.get(name, 0) < allowed
    ]
    assert not grew, f"{rule} went up in {grew}. {remedy}"
    assert not shrank, (
        f"{rule} went down in {shrank}. Lower the matching baseline in {Path(__file__).name} "
        f"in the same commit, so the ratchet keeps describing the code."
    )


def test_resources_do_not_gain_catch_all_handlers():
    actual = _count_per_resource(
        lambda tree: sum(isinstance(node, ast.ExceptHandler) and _is_broad_handler(node) for node in ast.walk(tree))
    )
    _assert_ratchet(
        "Broad `except` handlers in Resources/",
        actual,
        BROAD_EXCEPT_HANDLERS,
        "Let the error reach Api/error_handlers.py (coding-rules -> Error Handling); catch only a "
        "specific type this endpoint maps differently from the central handlers.",
    )


def test_resources_do_not_gain_abort_500_calls():
    actual = _count_per_resource(
        lambda tree: sum(isinstance(node, ast.Call) and _is_abort_500(node) for node in ast.walk(tree))
    )
    _assert_ratchet(
        "`abort(500)` calls in Resources/",
        actual,
        ABORT_500_CALLS,
        "A resource aborts to make a decision (403, 404), never to report an exception it caught.",
    )


def test_resources_do_not_gain_direct_db_access():
    actual = _count_per_resource(lambda tree: sum(_is_db_session(node) for node in ast.walk(tree)))
    _assert_ratchet(
        "`db.session` uses in Resources/",
        actual,
        DB_SESSION_USES,
        "Move the query into the service that owns the entity.",
    )


def test_resources_do_not_gain_data_layer_imports():
    importers = {path.name for path in RESOURCES_DIR.glob("*.py") if _imports_data_layer(_parse(path))}
    gained = sorted(importers - DATA_LAYER_IMPORTERS)
    lost = sorted(DATA_LAYER_IMPORTERS - importers)
    assert not gained, f"Resources importing Api.database or Models.* for the first time: {gained}. Go through a service."
    assert not lost, (
        f"Resources no longer importing the data layer: {lost}. Remove them from "
        f"DATA_LAYER_IMPORTERS in {Path(__file__).name} in the same commit."
    )


def test_services_import_no_http_machinery():
    """Services know the caller (`g`), config (`current_app`) and mail templates; nothing of
    the request or response. A hard rule: no baseline, because nothing breaks it today."""
    offenders = {}
    for path in sorted(SERVICES_DIR.rglob("*.py")):
        relative = path.relative_to(SERVICES_DIR).as_posix()
        if relative.startswith(SERVICE_HTTP_EXEMPT):
            continue
        imported = {
            alias.name
            for node in ast.walk(_parse(path))
            if isinstance(node, ast.ImportFrom) and node.module == "flask"
            for alias in node.names
        }
        extra = sorted(imported - SERVICE_FLASK_ALLOWED)
        if extra:
            offenders[relative] = extra
    assert not offenders, (
        f"Services importing HTTP machinery from flask: {offenders}. Raise a plain exception and "
        f"let the resource or Api/error_handlers.py turn it into a response."
    )


def test_every_test_module_is_collected():
    """A test file that pytest.ini's `python_files` does not match never runs — and nothing says so."""
    parser = configparser.ConfigParser()
    parser.read(BACKEND_ROOT / "pytest.ini")
    patterns = parser["pytest"]["python_files"].split()

    uncollected = []
    for path in sorted(TESTS_DIR.rglob("*.py")):
        if any(fnmatch.fnmatch(path.name, pattern) for pattern in patterns):
            continue
        defines_tests = any(
            (isinstance(node, ast.FunctionDef) and node.name.startswith("test_"))
            or (isinstance(node, ast.ClassDef) and node.name.startswith("Test"))
            for node in _parse(path).body
        )
        if defines_tests:
            uncollected.append(path.relative_to(BACKEND_ROOT).as_posix())
    assert not uncollected, (
        f"Test modules pytest never collects (python_files = {patterns}): {uncollected}. "
        f"Rename them or widen python_files in pytest.ini."
    )
