import json
import logging

from flask import g


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
        for field in ("request_id", "task_id"):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        return json.dumps(entry)


class RequestContextFilter(logging.Filter):
    """Injects g.request_id into every log record emitted during a request."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.request_id = getattr(g, "request_id", None)
        except RuntimeError:
            record.request_id = None
        return True
