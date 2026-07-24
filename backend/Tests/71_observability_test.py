import logging

import logfire


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
