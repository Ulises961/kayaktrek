import logging

import logfire
import pytest
from opentelemetry.util.http import parse_excluded_urls

from Api.observability import _EXCLUDED_URL_PATTERNS


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
