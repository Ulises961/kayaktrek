import logging

import logfire
import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import SpanProcessor
from opentelemetry.util.http import parse_excluded_urls

from Api.observability import _EXCLUDED_URL_PATTERNS, setup_logfire
from Resources.item_category_resource import ITEM_CATEGORY_ENDPOINT


def test_logfire_logging_handler_is_capped_at_info(app):
    """Regression guard: setup_logfire() (Api/observability.py) attaches a
    logfire.LogfireLoggingHandler to the root logger so application logger.info(...) calls
    reach Logfire, not just stdout. Uncapped, it also forwards every third-party DEBUG line
    (urllib3, botocore, ...) — expensive against the free-tier budget, and DEBUG lines from
    Logfire's own outbound export calls specifically trigger the handler's fallback (a plain,
    unformatted StreamHandler), duplicating every one of those lines in stdout. The `app`
    fixture already triggers createApp() -> setup_logfire() once per test session — this
    inspects that real configured state rather than calling setup_logfire() again, which would
    just pile up a second handler on the shared root logger.
    """
    handlers = [
        handler
        for handler in logging.getLogger().handlers
        if isinstance(handler, logfire.LogfireLoggingHandler)
    ]

    assert len(handlers) == 1
    assert handlers[0].level == logging.INFO


@pytest.mark.parametrize(
    "url, expected_excluded",
    [
        ("http://api.test/api/v1/live/trip/abc-123/stream", True),
        # The web client never sends a ticket, M9's React Native one always will —
        # the query string is part of the URL these patterns are searched against.
        ("http://api.test/api/v1/live/trip/abc-123/stream?ticket=header.body.sig", True),
        ("http://api.test/api/v1/live/story/share-token/stream", True),
        ("http://api.test/api/v1/tiles/openseamap/12/2048/1362.png", True),
        ("http://api.test/api/v1/health", True),
        # Minting a ticket is once per connection and worth tracing — but the
        # patterns are matched with an unanchored re.search, so ".../stream"
        # silently swallowed ".../stream-ticket" until it was anchored.
        ("http://api.test/api/v1/live/trip/abc-123/stream-ticket", False),
        # Everything else is still traced, including the rest of the live blueprint.
        ("http://api.test/api/v1/live/trip/abc-123/position", False),
        ("http://api.test/api/v1/trip/abc-123", False),
    ],
)
def test_only_high_volume_low_value_routes_are_excluded_from_tracing(url, expected_excluded):
    """M13 §A.0.4 cost guardrail: the tile proxy, the health check and the two SSE
    streams are dropped from Flask's per-request auto-tracing because they are
    structurally high-volume and say nothing useful at 100% sampling. Anything else
    reaching this list is a hole in the traces, not a saving.
    """
    excluded_urls = parse_excluded_urls(_EXCLUDED_URL_PATTERNS)

    assert excluded_urls.url_disabled(url) is expected_excluded


class _RecordingSpanProcessor(SpanProcessor):
    """Collects finished spans, but only while armed.

    Attached to the process-wide tracer provider, which has no removal API — the arm
    flag is what keeps it from accumulating every span of every other test in this
    xdist worker for the rest of the session.
    """

    def __init__(self):
        self.spans = []
        self.recording = False

    def on_end(self, span):
        if self.recording:
            self.spans.append(span)


@pytest.fixture(scope="module")
def span_recorder(app):
    recorder = _RecordingSpanProcessor()
    trace.get_tracer_provider().add_span_processor(recorder)
    return recorder


@pytest.fixture
def recorded_spans(span_recorder):
    span_recorder.spans.clear()
    span_recorder.recording = True
    yield span_recorder.spans
    span_recorder.recording = False


def test_health_check_emits_no_telemetry(client, recorded_spans):
    """The single highest-volume route in the deployment: both the backend and the SSE
    sidecar poll it every 10s, forever. Excluding it from Flask auto-tracing was never
    enough on its own — the DB ping underneath produced a SQLAlchemy span that outlived
    the exclusion and, having lost its parent to it, arrived as a top-level trace. This
    asserts the whole request is silent, which is the property the exclusion list claims
    and could not deliver by itself.
    """
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}
    assert [span.name for span in recorded_spans] == []


def test_an_unexcluded_route_still_emits_telemetry(client, recorded_spans):
    """Positive control for the test above: if the recorder were mis-wired, or Flask/
    SQLAlchemy instrumentation silently stopped being installed, "no spans" would pass
    for the wrong reason on every excluded route at once.
    """
    response = client.get(ITEM_CATEGORY_ENDPOINT)

    assert response.status_code == 200
    assert len(recorded_spans) > 0


def _stub_logfire(monkeypatch) -> dict:
    """Neutralise every side effect of setup_logfire except the configure() call.

    Real instrumentation would double-instrument the session-scoped app, and the real
    LogfireLoggingHandler would be left attached to the root logger for every test that
    runs after this one.
    """
    captured: dict = {}
    monkeypatch.setattr(logfire, "configure", lambda **kwargs: captured.update(kwargs))
    for name in (
        "instrument_flask",
        "instrument_sqlalchemy",
        "instrument_celery",
        "instrument_requests",
    ):
        monkeypatch.setattr(logfire, name, lambda *a, **k: None)
    monkeypatch.setattr(logfire, "LogfireLoggingHandler", lambda *a, **k: logging.NullHandler())
    return captured


def test_testing_mode_never_sends_telemetry(app, monkeypatch):
    """A token in the ambient environment must not turn a test run into real traffic.

    `send_to_logfire="if-token-present"` was the only guard, and "present" was decided
    by the environment. Not the shell, though — Api/config.py calls load_dotenv() at
    import and pytest imports it, so the token that dev and production run from is
    present in every local test run on every machine, unavoidably. That had pytest
    shipping spans, metrics and log records to the production Logfire project, seen as
    POST logfire-eu.pydantic.dev/v1/metrics -> 200 mid-suite. CI escaped only because it
    has no .env to find.

    So the assertion is specifically that a *plausible token being present* changes
    nothing under testing. Note this test cannot be written as "assert no network call
    happened": with no token in the environment that passes vacuously, which is the shape
    the original bug hid behind.
    """
    monkeypatch.setenv("LOGFIRE_TOKEN", "pylf_v1_eu_0000000000000000000000000000")
    captured = _stub_logfire(monkeypatch)

    setup_logfire(app, "testing")

    assert captured["send_to_logfire"] is False


@pytest.mark.parametrize("config_mode", ["development", "staging", "production"])
def test_other_modes_still_defer_to_the_token(app, monkeypatch, config_mode):
    """Positive control. The guard must be testing-only.

    Without this, `send_to_logfire=False` unconditionally would satisfy the test above
    and silently disable observability everywhere — including production, where nothing
    would fail and nobody would notice until a trace was wanted.
    """
    monkeypatch.setenv("LOGFIRE_TOKEN", "pylf_v1_eu_0000000000000000000000000000")
    captured = _stub_logfire(monkeypatch)

    setup_logfire(app, config_mode)

    assert captured["send_to_logfire"] == "if-token-present"
