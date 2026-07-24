import json
import logging

from flask import g
from opentelemetry import trace

# Standard LogRecord attributes that should not be treated as extra context fields.
_STANDARD_RECORD_ATTRS = frozenset({
    "args", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "message", "module", "msecs", "msg",
    "name", "pathname", "process", "processName", "relativeCreated",
    "stack_info", "taskName", "thread", "threadName",
})


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)
        # Capture all extra={} fields passed to the logger call.
        for key, value in record.__dict__.items():
            if key not in _STANDARD_RECORD_ATTRS and not key.startswith("_"):
                entry[key] = value
        return json.dumps(entry)


class RequestContextFilter(logging.Filter):
    """Injects g.request_id and the active OTel trace context into every log record.

    trace_id/span_id let a log line be pivoted to its Logfire trace (and vice versa)
    in any log aggregator, per the correlation plan in docs/adr/foundation.md. Absent
    outside an active span (e.g. a Celery beat task with no instrumented entry point).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.request_id = getattr(g, "request_id", None)
        except RuntimeError:
            record.request_id = None

        span_context = trace.get_current_span().get_span_context()
        if span_context.is_valid:
            record.trace_id = format(span_context.trace_id, "032x")
            record.span_id = format(span_context.span_id, "016x")
        return True
