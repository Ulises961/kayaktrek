import logging
import os
import sys

import logfire
from flask import Flask

from Api.database import db


def _resolve_service_name() -> str:
    """Distinct service.name per backend process, so the four roles (main app, SSE
    sidecar, Celery worker, Celery beat) are separable in the Logfire UI while a
    request that triggers a task still correlates into one trace.

    SERVICE_ROLE (set by entrypoint.sh, ADR-033) only distinguishes the SSE sidecar
    from the main app — celery_worker.py is invoked directly by
    `celery -A celery_worker worker|beat` and never sets it, so those two fall back
    to a sys.argv check.
    """
    role = os.environ.get("SERVICE_ROLE")
    if role:
        return f"kayak-backend-{role}"
    if "beat" in sys.argv:
        return "kayak-backend-beat"
    if "worker" in sys.argv:
        return "kayak-backend-worker"
    return "kayak-backend"


# Routes excluded from per-request tracing because they are high-volume and low-value:
#   - the tile proxy (one map view bursts 30-60 requests) and the health check (polled every
#     10s by every container);
#   - the SSE streams and the trip change-log poll (every open page hits it every few seconds).
#     A stream re-queries the Trip on every heartbeat for the connection's whole lifetime,
#     which auto-instrumented is one unbounded SQLAlchemy span per tick per viewer. Excluding
#     the route drops only its Flask span; the per-tick spans are suppressed at their source
#     (logfire.suppress_instrumentation() in stream_events), which lets the manual
#     `sse_connection` span be the connection's only top-level span.
# excluded_urls takes comma-separated regexes, matched unanchored against the full URL, query
# string included. The stream and poll routes carry an explicit `(\?|$)` so the pattern does
# not also swallow POST .../stream-ticket, which should stay traced; the crew stream's
# `?ticket=` must still match.
_EXCLUDED_URL_PATTERNS = ",".join([
    r"/api/v1/tiles/.*",
    r"/api/v1/health",
    r"/api/v1/live/trip/[^/]+/stream(\?|$)",
    r"/api/v1/live/trip/[^/]+/changes(\?|$)",
    r"/api/v1/live/story/[^/]+/stream(\?|$)",
])


def setup_logfire(app: Flask, config_mode: str) -> None:
    """Configure Logfire (Pydantic's managed OTel backend) and auto-instrument
    Flask, SQLAlchemy, Celery, and outbound `requests` calls (OpenMeteo, the
    tile proxy's upstream fetch).

    Safe to call unconditionally in every environment: without LOGFIRE_TOKEN set
    (CI, a dev machine that hasn't configured one), send_to_logfire=
    "if-token-present" makes this a no-op rather than prompting or erroring.
    console=False since spans would otherwise duplicate the JsonFormatter
    stdout stream in an incompatible format. Note this only configures the
    SDK — `docker-compose.yml` must also propagate LOGFIRE_TOKEN into each
    container's environment, or a real token set locally never reaches it.

    **Testing never sends, whatever the environment says.** "if-token-present" is not
    enough: `Api/config.py` calls `load_dotenv()` at import and pytest imports it like
    everything else, so the token in the `.env` that dev and production run from is
    present in every local test run, however clean the shell. Synthetic traffic would
    spend the free tier's record budget, land in the same project as real traffic, and
    add a network round trip to every run. CI has no `.env`, but that is luck, so the
    guard below is keyed on `config_mode` and cannot be undone by ambient environment.
    """
    logfire.configure(
        # Keyed on the config mode the app was built with, not an env var, so a .env that
        # holds a real token cannot switch it back on. See the docstring.
        send_to_logfire=False if config_mode == "testing" else "if-token-present",
        service_name=_resolve_service_name(),
        environment=config_mode,
        console=False,
    )
    logfire.instrument_flask(app, excluded_urls=_EXCLUDED_URL_PATTERNS)
    with app.app_context():
        logfire.instrument_sqlalchemy(engine=db.engine)
    logfire.instrument_celery()
    logfire.instrument_requests()
    # The instrument_* calls above do not touch stdlib `logging`, so application
    # `logger.info(...)` calls (Resources/, Services/, Tasks/) would reach only stdout.
    # LogfireLoggingHandler forwards them, and no-ops without a LOGFIRE_TOKEN like the rest of this
    # function. It is added beside setup_logging()'s handlers, so stdout JSON logging is unaffected.
    #
    # Capped at INFO: uncapped it forwards every third-party DEBUG line (urllib3, botocore,
    # redis, ...), which is expensive against the free-tier budget, and Logfire's own export-call
    # DEBUG lines trigger the handler's fallback StreamHandler and appear twice in stdout.
    logfire_handler = logfire.LogfireLoggingHandler()
    logfire_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(logfire_handler)
