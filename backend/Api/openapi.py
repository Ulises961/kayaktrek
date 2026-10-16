import importlib
import inspect
import pkgutil
from importlib.metadata import version as package_version

import marshmallow
from apispec import APISpec, yaml_utils
from apispec.ext.marshmallow import MarshmallowPlugin
from apispec_webframeworks.flask import FlaskPlugin
from flask import Flask, Response, jsonify
from flask_swagger_ui import get_swaggerui_blueprint
from werkzeug.routing import Rule

import Schemas

OPENAPI_SPEC_ENDPOINT = "/api/v1/openapi.json"
DOCS_URL_PREFIX = "/api/v1/docs"

# Dev-only routes (404 outside DEVELOPMENT, backend/CLAUDE.md) aren't part of the public
# contract a client generator should ever see.
_EXCLUDED_BLUEPRINTS = {"dev"}

# Werkzeug converter class name -> OpenAPI schema for path parameters. Falls back to string for
# any converter not listed (covers every one actually used in this codebase's routes today).
_CONVERTER_SCHEMAS = {
    "IntegerConverter": {"type": "integer"},
    "FloatConverter": {"type": "number"},
    "UUIDConverter": {"type": "string", "format": "uuid"},
}
_DEFAULT_PARAM_SCHEMA = {"type": "string"}


def _path_parameters(rule: Rule) -> list[dict]:
    """OpenAPI requires every {param} in a path template to have a matching `parameters` entry
    (openapi-spec-validator enforces this — UnresolvableParameterError otherwise). apispec's
    FlaskPlugin substitutes <converter:name> into {name} in the path string but doesn't declare
    the parameter object itself, so this reads Werkzeug's own per-argument converters (the same
    source of truth the router already uses) rather than re-deriving types by hand."""
    converters = getattr(rule, "_converters", {})
    return [
        {
            "name": name,
            "in": "path",
            "required": True,
            "schema": _CONVERTER_SCHEMAS.get(type(converters[name]).__name__, _DEFAULT_PARAM_SCHEMA),
        }
        for name in rule.arguments
    ]


def _register_marshmallow_schemas(spec: APISpec) -> None:
    """Registers every Marshmallow schema in Schemas/ as an OpenAPI component. Schemas are
    discovered by walking the package, so no second hand-maintained list can drift when a
    Schemas/*.py file is added. Only classes *defined* in a Schemas/ module are registered
    (`cls.__module__`), so a schema imported into another for composition is not registered
    twice under two names. BaseSchema is the abstract base and is skipped. Leading-underscore
    classes (`_BlockedUserSchema`, `_ShallowUserSchema`, ...) are schemas private to one parent,
    used only as a nested field; MarshmallowPlugin registers them when the parent is, so doing it
    here would duplicate the component.
    """
    marshmallow_plugin = next(p for p in spec.plugins if isinstance(p, MarshmallowPlugin))
    assert marshmallow_plugin.converter is not None

    for _, module_name, _ in pkgutil.iter_modules(Schemas.__path__, f"{Schemas.__name__}."):
        module = importlib.import_module(module_name)
        for name, cls in inspect.getmembers(module, inspect.isclass):
            # Registering a schema auto-registers any other schema it nests as a field too
            # (MarshmallowPlugin's own converter), so this membership check must read the live
            # registry on every iteration — a snapshot taken once upfront would miss schemas
            # that got auto-registered mid-loop by an earlier, unrelated parent schema.
            already_registered = {ref[0] for ref in marshmallow_plugin.converter.refs}
            if (
                issubclass(cls, marshmallow.Schema)
                and cls is not marshmallow.Schema
                and cls.__module__ == module_name
                and name != "BaseSchema"
                and not name.startswith("_")
                and cls not in already_registered
            ):
                spec.components.schema(name, schema=cls)


def _build_spec(app: Flask) -> APISpec:
    """Walks every registered route and derives its OpenAPI path from the Flask rule itself
    (method, URL, path params), so path and method coverage cannot drift from the routes
    actually registered. A view's own YAML docstring, where present, is merged in for the
    request/response detail the Marshmallow schemas provide; a route without one gets a bare
    path entry rather than being skipped.
    """
    spec = APISpec(
        title="Kayaktrek API",
        version=package_version("kayak-expedition-planner"),
        openapi_version="3.0.3",
        plugins=[FlaskPlugin(), MarshmallowPlugin()],
        info={
            "description": (
                "Planning-grade data only — not a substitute for official charts, tide "
                "tables, and sound seamanship."
            )
        },
        # No /api/v1 prefix here: FlaskPlugin derives each path from the rule's full URL, which
        # already includes the blueprint's url_prefix, so a servers entry of "/api/v1" would
        # double it ("/api/v1/api/v1/auth/login") once a client joins servers.url and the path.
        servers=[{"url": "/"}],
    )
    spec.components.security_scheme(
        "bearerAuth", {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    )
    _register_marshmallow_schemas(spec)

    seen_endpoints: set[str] = set()
    with app.test_request_context():
        for rule in app.url_map.iter_rules():
            if rule.endpoint == "static" or rule.endpoint in seen_endpoints:
                continue
            blueprint_name = rule.endpoint.split(".", 1)[0]
            if blueprint_name in _EXCLUDED_BLUEPRINTS:
                continue

            view = app.view_functions[rule.endpoint]

            # A route parked behind a feature gate (Api/features.py) 404s while its flag is
            # off, so publishing it would describe a contract this deployment does not
            # honour. Read from the same marker the decorator sets rather than a second
            # list, for the same reason _auth_required is: the two cannot drift.
            feature_flag = getattr(view, "_feature_flag", None)
            if feature_flag and not app.config.get(feature_flag):
                continue

            seen_endpoints.add(rule.endpoint)

            # JWTService.authenticate_restful (Services/Middleware/auth_middleware.py) sets
            # _auth_required on its wrapper; functools.wraps' __dict__ copy propagates it through
            # any further stacked decorator (require_owner, require_leader, rate limits, ...), so
            # this reads the actual decorator stack rather than a second, hand-maintained list of
            # which routes need a token — distinct from _populates_current_user, which
            # authenticate_optional also sets despite never requiring one.
            auth_required = getattr(view, "_auth_required", False)

            # FlaskPlugin.path_helper handles a docstring with `operations.update(doc_ops)` — a
            # shallow replace per HTTP method, not a merge — so passing a docstring-bearing view
            # straight to spec.path() would drop the auto-injected `security` key below. The
            # docstring is parsed here instead, so the pieces take precedence in this order:
            # baseline defaults < docstring content < auto-injected security (unless the docstring
            # sets its own, which wins). The view's docstring is then blanked for the spec.path()
            # call so FlaskPlugin has nothing left to clobber the result with.
            doc_operations = yaml_utils.load_operations_from_docstring(view.__doc__ or "")

            methods = (rule.methods or set()) - {"HEAD", "OPTIONS"}
            operations: dict = {}
            for method in methods:
                method_lower = method.lower()
                operation: dict = {"responses": {"200": {"description": "Successful response"}}}
                operation.update(doc_operations.get(method_lower, {}))
                if auth_required and "security" not in operation:
                    operation["security"] = [{"bearerAuth": []}]
                operations[method_lower] = operation

            original_doc = view.__doc__
            try:
                view.__doc__ = None
                spec.path(view=view, operations=operations, parameters=_path_parameters(rule))
            finally:
                view.__doc__ = original_doc

    return spec


def setup_openapi(app: Flask) -> None:
    """Publishes the generated spec at OPENAPI_SPEC_ENDPOINT and a Swagger UI at DOCS_URL_PREFIX.
    Public and unauthenticated: it is read-only schema metadata, and every mutating route it
    describes still requires its own JWT. Built once at app-factory time rather than per request,
    since the route table is fixed for the process lifetime and the endpoint is public and may
    be crawled.
    """
    spec = _build_spec(app)
    spec_dict = spec.to_dict()

    @app.route(OPENAPI_SPEC_ENDPOINT)
    def openapi_json() -> Response:
        return jsonify(spec_dict)

    swagger_ui_blueprint = get_swaggerui_blueprint(
        DOCS_URL_PREFIX,
        OPENAPI_SPEC_ENDPOINT,
        config={"app_name": "Kayaktrek API"},
    )
    app.register_blueprint(swagger_ui_blueprint, url_prefix=DOCS_URL_PREFIX)
