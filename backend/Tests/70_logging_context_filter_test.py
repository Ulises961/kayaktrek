import io
import json
import logging

from opentelemetry.sdk.trace import TracerProvider

from Services.Utils.logging_utils import JsonFormatter, RequestContextFilter


def _log_via_child_logger(parent_name: str, wire_filter_on_handler: bool) -> dict:
    """Mirrors Api/logging_config.py's wiring: a StreamHandler with a JsonFormatter,
    logging through a *child* of the configured logger (every real application logger
    is `logging.getLogger(__name__)`, a child of root) — never through the configured
    logger directly."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))
    if wire_filter_on_handler:
        handler.addFilter(RequestContextFilter())

    parent_logger = logging.getLogger(parent_name)
    parent_logger.handlers.clear()
    parent_logger.setLevel(logging.INFO)
    parent_logger.propagate = False
    if not wire_filter_on_handler:
        parent_logger.addFilter(RequestContextFilter())
    parent_logger.addHandler(handler)

    child_logger = logging.getLogger(f"{parent_name}.child")
    child_logger.info("trip_created", extra={"trip_id": "abc123"})

    return json.loads(stream.getvalue())


def test_filter_on_handler_reaches_child_logger_records():
    entry = _log_via_child_logger("kep_test_handler_filter", wire_filter_on_handler=True)

    assert entry["trip_id"] == "abc123"
    assert "request_id" in entry


def test_filter_on_logger_alone_never_reaches_child_logger_records():
    """Regression guard: a Filter attached via Logger.addFilter only runs for records the
    filtered Logger itself originates, not for child loggers walking up the hierarchy —
    the historical bug (Api/logging_config.py once did root_logger.addFilter(...) instead
    of attaching to the handler), which silently dropped request_id/trace_id/span_id from
    every real application log line."""
    entry = _log_via_child_logger("kep_test_logger_only_filter", wire_filter_on_handler=False)

    assert "request_id" not in entry


def test_request_context_filter_attaches_trace_id_from_active_span():
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))
    handler.addFilter(RequestContextFilter())

    logger = logging.getLogger("kep_test_trace_id_filter")
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    # A locally-constructed SDK provider (no exporter attached) rather than the ambient
    # global tracer — this test's outcome must not depend on whether some other test in
    # this worker already triggered the app fixture's Logfire setup first.
    tracer = TracerProvider().get_tracer("kep-test-tracer")
    with tracer.start_as_current_span("test-span") as span:
        logger.info("inside_span")
        expected_trace_id = format(span.get_span_context().trace_id, "032x")

    entry = json.loads(stream.getvalue())
    assert entry["trace_id"] == expected_trace_id
    assert "span_id" in entry


def test_request_context_filter_omits_trace_id_outside_a_span():
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))
    handler.addFilter(RequestContextFilter())

    logger = logging.getLogger("kep_test_no_span_filter")
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    logger.info("outside_span")

    entry = json.loads(stream.getvalue())
    assert "trace_id" not in entry
