import logging
import os
import sys

import logfire
from flask import Flask

from Api.database import db


def _resolve_service_name() -> str:
    """Distinct service.name per backend process, so the four roles M8 introduced
    (main app, SSE sidecar, Celery worker, Celery beat) are separable in the
    Logfire UI while a request that triggers a task still correlates into one
    trace (M13 §A.0.3).

    SERVICE_ROLE (entrypoint.sh, M8 ADR-033) only distinguishes the SSE sidecar
    from the main app via gunicorn's entrypoint dispatch — celery_worker.py is
    invoked directly by `celery -A celery_worker worker|beat` and never sets it,
    so fall back to a sys.argv check for those two.
    """
    role = os.environ.get("SERVICE_ROLE")
    if role:
        return f"kayak-backend-{role}"
    if "beat" in sys.argv:
        return "kayak-backend-beat"
    if "worker" in sys.argv:
        return "kayak-backend-worker"
    return "kayak-backend"


# M13 §A.0.4 cost guardrail: two route families are structurally high-volume
# and low-diagnostic-value at 100% trace sampling.
#   - The tile proxy (D10, 600/min per IP — a single map view bursts 30-60
#     requests) and the health check (polled every 10s by every container's
#     compose healthcheck).
#   - The SSE stream routes: LiveStreamService.stream_events re-queries the
#     Trip on every heartbeat tick (every 15s, per open connection, for the
#     connection's entire lifetime) — auto-instrumented, that's one unbounded
#     SQLAlchemy span per tick per viewer. Excluding the route here only removes
#     the per-request Flask span, which a stream produces one of anyway; the
#     per-tick SQLAlchemy spans are killed at their source instead, by the
#     logfire.suppress_instrumentation() around that query in stream_events.
#     Both are needed: this exclusion is what lets the manual
#     logfire.span("sse_connection") be the connection's only top-level span
#     (A.2), and the suppression is what stops it accumulating children.
# excluded_urls takes OTel's comma-separated regex-per-entry format, matched with
# an unanchored re.search against the full request URL — hence the explicit
# `(\?|$)` on the stream routes, without which the pattern also swallows the
# once-per-connection POST .../stream-ticket, which we do want traced. The query
# string is part of that URL, so the crew stream's own `?ticket=` must still match.
_EXCLUDED_URL_PATTERNS = ",".join([
    r"/api/v1/tiles/.*",
    r"/api/v1/health",
    r"/api/v1/live/trip/[^/]+/stream(\?|$)",
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

    **Testing never sends, whatever the environment says.** "if-token-present" was
    not enough, and the reason is worth stating precisely, because the obvious
    guess is wrong. It is not that a developer exported LOGFIRE_TOKEN in their
    shell — it is that `Api/config.py` calls `load_dotenv()` at import, and pytest
    imports it like everything else. So the token in the `.env` that dev and
    production run from is present in every local test run, on every machine, with
    no way to avoid it by keeping a clean shell. Observed as
    `POST logfire-eu.pydantic.dev/v1/metrics -> 200` mid-suite.

    The cost is a 10M-record/month free-tier hard stop being spent on synthetic
    traffic, that traffic landing in the same project real traffic does, and a
    network round trip in the export path of every run. CI was never affected only
    because CI has no `.env` to find — an accident of environment, not a guarantee.
    The old docstring listed "tests" among the safe cases on exactly that accident.
    Now the code guarantees it.
    """
    logfire.configure(
        # Not `if-token-present` under testing — see the docstring. This is the whole
        # guard, and it is deliberately keyed on the config mode the app was built
        # with rather than on an env var, so it cannot be switched off by the same
        # kind of ambient environment that caused the leak.
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
    # instrument_* above only cover auto-instrumented spans (Flask/SQLAlchemy/Celery/requests) —
    # none of them touch the stdlib `logging` module, so without this, every application
    # `logger.info(...)` call (Resources/, Services/, Tasks/) never reaches Logfire at all, only
    # stdout. LogfireLoggingHandler forwards them; it no-ops cleanly with no LOGFIRE_TOKEN set,
    # same as the rest of this function. Added alongside setup_logging()'s handlers, not instead
    # of them — stdout JSON logging is unaffected.
    #
    # Capped at INFO: uncapped, this also forwards every third-party DEBUG line (urllib3,
    # botocore, redis, ...) to Logfire — expensive against the free-tier budget (A.0.5), and
    # DEBUG-level lines from Logfire's own outbound export calls specifically trigger the
    # handler's documented fallback (instrumentation is suppressed around Logfire's own network
    # calls to avoid tracing itself, so the fallback — a plain, unformatted StreamHandler —
    # fires instead), duplicating every one of those lines in stdout. Capping to INFO — already
    # this project's convention for "meaningful application signal" vs. library-internal noise
    # (backend/CLAUDE.md "Logging") — means those DEBUG lines never reach the handler at all.
    logfire_handler = logfire.LogfireLoggingHandler()
    logfire_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(logfire_handler)
